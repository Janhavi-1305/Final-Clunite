import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Create Supabase client with service role key (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: NextRequest) {
  try {
    const { clubEmail, pin, userId, clubName } = await request.json();

    console.log('API: Verifying club with:', {
      clubEmail,
      pin,
      userId,
      clubName,
    });

    // Query pending_clubs using service role (bypasses RLS)
    // If clubName is provided, include it in the search to handle duplicate emails
    let query = supabaseAdmin
      .from('pending_clubs')
      .select('*')
      .eq('official_email', clubEmail)
      .eq('pin', pin);

    const { data: pendingClubs, error } = await query;

    console.log('API: Query result:', { pendingClubs, error });

    if (error) {
      console.error('API: Database error:', error);
      return NextResponse.json(
        { error: 'Database error', details: error.message },
        { status: 500 }
      );
    }

    // Filter by club name if multiple results and clubName is provided
    let pendingClub = null;
    if (pendingClubs && pendingClubs.length > 0) {
      if (clubName && pendingClubs.length > 1) {
        // Multiple clubs with same email + pin, filter by club name
        pendingClub = pendingClubs.find(
          (club) =>
            club.club_data?.name?.toLowerCase() === clubName.toLowerCase()
        );
        if (!pendingClub) {
          // If exact match not found, use first one but log warning
          console.warn(
            'API: Multiple clubs found with email + pin, club name not matched. Using first.'
          );
          pendingClub = pendingClubs[0];
        }
      } else {
        // Single result or no clubName provided, use first one
        pendingClub = pendingClubs[0];
      }
    }

    if (!pendingClub) {
      // Try to find clubs with this email to help debug
      const { data: clubsByEmail } = await supabaseAdmin
        .from('pending_clubs')
        .select('official_email, pin, status, created_at, club_data')
        .eq('official_email', clubEmail)
        .order('created_at', { ascending: false });

      console.log('API: Clubs with this email:', clubsByEmail);

      return NextResponse.json(
        {
          error: 'Club not found',
          debug: {
            searchedEmail: clubEmail,
            searchedPin: pin,
            searchedClubName: clubName,
            clubsWithEmail: clubsByEmail,
          },
        },
        { status: 404 }
      );
    }

    // Check if PIN expired
    if (new Date(pendingClub.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'PIN has expired (48 hours)' },
        { status: 400 }
      );
    }

    // Return the pending club data
    return NextResponse.json({
      success: true,
      pendingClub,
    });
  } catch (error: any) {
    console.error('API: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
