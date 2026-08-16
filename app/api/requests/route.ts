import { NextResponse } from 'next/server';
import { memoryStore, getPool, RequestItem } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let results = [...memoryStore.requests];

    if (status) {
      results = results.filter(r => r.status === status);
    }

    return NextResponse.json({ success: true, requests: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error fetching requests' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { listing_id, buyer_user_id, type, scheduled_time, notes } = body;

    const listing = memoryStore.listings.find(l => l.id === listing_id);
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const newRequest: RequestItem = {
      id: `req-${Date.now()}`,
      listing_id,
      listing_title: listing.title,
      listing_type: listing.type,
      listing_price: listing.price,
      listing_unit: listing.unit,
      buyer_user_id: buyer_user_id || 'usr-buyer-1',
      buyer_name: 'Aarav Mehta',
      buyer_phone: '+91 97777 88888',
      senior_name: listing.owner_name || 'Savitri Devi',
      type: type || (listing.type === 'product' ? 'buy_order' : 'learn_request'),
      status: 'pending', // Starts as pending for Guardian review
      created_at: new Date().toISOString(),
      scheduled_time,
      notes
    };

    const pool = await getPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO requests (id, listing_id, buyer_user_id, type, status) VALUES ($1, $2, $3, $4, $5)`,
          [newRequest.id, newRequest.listing_id, newRequest.buyer_user_id, newRequest.type, newRequest.status]
        );
      } catch (dbErr) {
        console.warn('[DB] SQL request insert error:', dbErr);
      }
    }

    memoryStore.requests.unshift(newRequest);

    return NextResponse.json({
      success: true,
      request: newRequest,
      message: 'Request submitted successfully. Waiting for Guardian safety approval.'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error creating request' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { request_id, listing_id, action } = await req.json();

    // Handling listing approval (pending_guardian -> live)
    if (listing_id && action) {
      const listing = memoryStore.listings.find(l => l.id === listing_id);
      if (listing) {
        listing.status = action === 'approve' ? 'live' : 'draft';
        return NextResponse.json({
          success: true,
          listing,
          message: `Listing status updated to ${listing.status}`
        });
      }
    }

    // Handling request approval (pending -> guardian_approved / rejected)
    const targetRequest = memoryStore.requests.find(r => r.id === request_id);
    if (!targetRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (action === 'approve') {
      targetRequest.status = 'guardian_approved';
    } else if (action === 'reject') {
      targetRequest.status = 'rejected';
    } else if (action === 'complete') {
      targetRequest.status = 'completed';
    }

    const pool = await getPool();
    if (pool) {
      try {
        await pool.query(`UPDATE requests SET status = $1 WHERE id = $2`, [targetRequest.status, targetRequest.id]);
      } catch (dbErr) {
        console.warn('[DB] SQL request update error:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      request: targetRequest,
      message: `Request status updated to ${targetRequest.status}`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error updating request' }, { status: 500 });
  }
}
