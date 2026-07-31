import { createServerClient } from '@/lib/supabase';

interface Props { searchParams: { id?: string } }

export default async function UnsubscribePage({ searchParams }: Props) {
  const { id } = searchParams;
  let success = false;
  let error = '';

  if (id) {
    const db = createServerClient();

    const { data: log } = await db
      .from('send_logs')
      .select('id, contact_id, campaign_id')
      .eq('id', id)
      .single();

    if (log) {
      // Mark log
      await db.from('send_logs')
        .update({ status: 'unsubscribed' })
        .eq('id', log.id);

      // Get contact email + team
      const { data: contact } = await db
        .from('contacts')
        .select('email, team_id')
        .eq('id', log.contact_id)
        .single();

      if (contact) {
        // Unsubscribe contact
        await db.from('contacts')
          .update({ is_subscribed: false })
          .eq('id', log.contact_id);

        // Add to suppressions
        await db.from('suppressions').upsert(
          { team_id: contact.team_id, email: contact.email, reason: 'unsubscribe' },
          { onConflict: 'team_id,email' }
        );

        // Log event
        await db.from('events').insert({
          send_log_id: log.id,
          type: 'unsubscribe',
          metadata: {},
        });

        // Log unsubscribe event to campaign (incremented via reporting query)
        await db.from('send_logs')
          .update({ status: 'unsubscribed' })
          .eq('campaign_id', log.campaign_id)
          .eq('contact_id', log.contact_id);

        success = true;
      } else {
        error = 'Contact not found.';
      }
    } else {
      error = 'Invalid unsubscribe link.';
    }
  } else {
    error = 'Missing unsubscribe token.';
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center">
        {success ? (
          <>
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Unsubscribed</h1>
            <p className="text-gray-500 text-sm">
              You&apos;ve been successfully removed from this mailing list. You won&apos;t receive any more emails.
            </p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-500 text-sm">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
