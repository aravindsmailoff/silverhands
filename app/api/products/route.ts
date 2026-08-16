import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

// ── GET /api/products — fetch all products for a creator ──────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const creatorName = searchParams.get('creatorName');

  const pool = await getPool();
  if (!pool) {
    return NextResponse.json({ success: false, products: [] });
  }

  try {
    let query = `
      SELECT id, title, description, price, category, image_url, stock, is_active, created_at, creator_name
      FROM products
    `;
    const params: any[] = [];
    if (creatorName) {
      query += ` WHERE creator_name = $1`;
      params.push(creatorName);
    }
    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    return NextResponse.json({ success: true, products: result.rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, products: [] });
  }
}

// ── POST /api/products — create or update a product ──────────────────────
export async function POST(req: Request) {
  const pool = await getPool();
  if (!pool) {
    return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 });
  }

  const body = await req.json();
  const {
    id,
    title,
    description,
    price,
    category,
    image_url,
    stock,
    is_active = true,
    creator_name,
  } = body;

  if (!title || !price || !creator_name) {
    return NextResponse.json({ success: false, error: 'title, price, creator_name are required' }, { status: 400 });
  }

  // Ensure table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(64) PRIMARY KEY,
      creator_name VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC NOT NULL,
      category VARCHAR(64) DEFAULT 'general',
      image_url TEXT,
      stock INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const productId = id || ('prod_' + Date.now());

  try {
    await pool.query(`
      INSERT INTO products (id, creator_name, title, description, price, category, image_url, stock, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        category = EXCLUDED.category,
        image_url = EXCLUDED.image_url,
        stock = EXCLUDED.stock,
        is_active = EXCLUDED.is_active
    `, [productId, creator_name, title, description || '', price, category || 'general', image_url || null, stock ?? 1, is_active]);

    return NextResponse.json({ success: true, id: productId });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/products — remove a product ───────────────────────────────
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

  const pool = await getPool();
  if (!pool) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 });

  await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}

// ── PATCH /api/products — toggle active/inactive ──────────────────────────
export async function PATCH(req: Request) {
  const pool = await getPool();
  if (!pool) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 });

  const { id, is_active } = await req.json();
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

  await pool.query(`UPDATE products SET is_active = $1 WHERE id = $2`, [is_active, id]);
  return NextResponse.json({ success: true });
}
