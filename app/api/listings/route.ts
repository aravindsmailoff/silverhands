import { NextResponse } from 'next/server';
import { memoryStore, calculateHaversineDistance, roundTo500mGrid, getPool, Listing } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get('lat') || '28.6139'); // Default New Delhi center
    const lng = parseFloat(searchParams.get('lng') || '77.2090');
    const radiusKm = parseFloat(searchParams.get('radius') || '15');
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.toLowerCase();
    const status = searchParams.get('status') || 'live';

    const pool = await getPool();

    // If PostgreSQL Railway / local DB pool is connected, execute SQL Haversine query
    if (pool) {
      try {
        const query = `
          SELECT *, (
            6371 * acos(
              LEAST(1.0, GREATEST(-1.0, 
                cos(radians($1)) * cos(radians(lat)) *
                cos(radians(lng) - radians($2)) +
                sin(radians($1)) * sin(radians(lat))
              ))
            )
          ) AS distance
          FROM listings
          WHERE status = $3
          ORDER BY distance ASC;
        `;
        const result = await pool.query(query, [lat, lng, status]);
        let sqlListings: Listing[] = result.rows;

        if (category && category !== 'all') {
          sqlListings = sqlListings.filter(l => l.category === category);
        }
        if (search) {
          sqlListings = sqlListings.filter(l =>
            l.title.toLowerCase().includes(search) || l.description.toLowerCase().includes(search)
          );
        }
        sqlListings = sqlListings.filter(l => (l.distance || 0) <= radiusKm);

        return NextResponse.json({ success: true, listings: sqlListings });
      } catch (dbErr) {
        console.warn('[DB] SQL Haversine query error, fallback to memoryStore:', dbErr);
      }
    }

    // In-memory fallback query using exact Haversine calculation
    let results = memoryStore.listings.map(item => {
      const distance = calculateHaversineDistance(lat, lng, item.lat, item.lng);
      return { ...item, distance };
    });

    if (status) {
      results = results.filter(item => item.status === status || status === 'all');
    }

    if (category && category !== 'all') {
      results = results.filter(item => item.category === category);
    }

    if (search) {
      results = results.filter(
        item =>
          item.title.toLowerCase().includes(search) ||
          item.description.toLowerCase().includes(search) ||
          item.locality_label.toLowerCase().includes(search)
      );
    }

    results = results.filter(item => item.distance! <= radiusKm);
    results.sort((a, b) => (a.distance || 0) - (b.distance || 0));

    return NextResponse.json({ success: true, listings: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error fetching listings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { owner_user_id, type, title, description, price, unit, lat, lng, locality_label, category } = body;

    if (!title || !description || !price) {
      return NextResponse.json({ error: 'Title, description, and price are required' }, { status: 400 });
    }

    // Round lat/lng to ~500m grid to preserve elder privacy
    const roundedLat = roundTo500mGrid(lat || 28.6139);
    const roundedLng = roundTo500mGrid(lng || 77.2090);

    const newListing: Listing = {
      id: `lst-${Date.now()}`,
      owner_user_id: owner_user_id || 'usr-senior-1',
      owner_name: 'Senior Elder Creator',
      type: type || 'skill',
      title,
      description,
      price: Number(price),
      unit: unit || (type === 'product' ? 'item' : 'session'),
      lat: roundedLat,
      lng: roundedLng,
      locality_label: locality_label || 'Connaught Place, New Delhi (~500m area)',
      status: 'pending_guardian', // Automatically sits at pending_guardian status as per requirements
      category: category || 'cooking',
      created_at: new Date().toISOString()
    };

    const pool = await getPool();

    // Save to PostgreSQL if connected
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO listings (id, owner_user_id, type, title, description, price, unit, lat, lng, locality_label, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            newListing.id,
            newListing.owner_user_id,
            newListing.type,
            newListing.title,
            newListing.description,
            newListing.price,
            newListing.unit,
            newListing.lat,
            newListing.lng,
            newListing.locality_label,
            newListing.status
          ]
        );
      } catch (err) {
        console.warn('[DB] SQL Insert error, falling back to memory store:', err);
      }
    }

    // Push to memory store
    memoryStore.listings.unshift(newListing);

    return NextResponse.json({
      success: true,
      listing: newListing,
      message: 'Listing created successfully and sent to Guardian for safety approval'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error creating listing' }, { status: 500 });
  }
}
