'use client';
import { useEffect, useState } from 'react';
import CampaignForm from '@/components/campaigns/CampaignForm';

interface Props { params: { id: string } }

export default function EditCampaignPage({ params }: Props) {
  const [initial, setInitial] = useState<Record<string, unknown> | null>(null);
  const [error, setError]     = useState('');

  useEffect(() => {
    fetch(`/api/campaigns/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setInitial({
          name:         data.name        ?? '',
          subject:      data.subject     ?? '',
          from_name:    data.from_name   ?? '',
          from_email:   data.from_email  ?? '',
          reply_to:     data.reply_to    ?? '',
          html_body:    data.html_body   ?? '',
          account_id:   data.account_id  ?? '',
          // Multi-account: prefer account_ids, fall back to wrapping account_id
          account_ids:  Array.isArray(data.account_ids) && data.account_ids.length
            ? data.account_ids
            : data.account_id ? [data.account_id] : [],
          list_ids:     data.list_ids    ?? [],
          template_id:  data.template_id ?? '',
          scheduled_at: data.scheduled_at
            ? new Date(data.scheduled_at).toISOString().slice(0,16)
            : '',
        });
      })
      .catch(() => setError('Failed to load campaign'));
  }, [params.id]);

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        {error}
      </div>
    </div>
  );

  if (!initial) return (
    <div className="p-8 text-gray-400 text-sm">Loading campaign...</div>
  );

  return (
    <CampaignForm
      mode="edit"
      campaignId={params.id}
      initial={initial as Parameters<typeof CampaignForm>[0]['initial']}
    />
  );
}
