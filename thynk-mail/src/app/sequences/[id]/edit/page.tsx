'use client';
import { useEffect, useState } from 'react';
import SequenceForm, { type SequenceFormInitial } from '@/components/sequences/SequenceForm';
import { utcToWallInput } from '@/lib/sequence-time';

interface Props { params: { id: string } }

export default function EditSequencePage({ params }: Props) {
  const [initial, setInitial] = useState<SequenceFormInitial | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/sequences/${params.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        if (d.status !== 'draft') { setError('Only draft sequences can be edited.'); return; }
        setInitial({
          name: d.name ?? '',
          reply_to: d.reply_to ?? '',
          timezone: d.timezone ?? 'Asia/Kolkata',
          start_local: d.start_at ? utcToWallInput(d.start_at, d.timezone ?? 'Asia/Kolkata') : '',
          list_ids: d.list_ids ?? [],
          account_ids: d.account_ids ?? [],
          steps: (d.steps ?? []).map((s: any) => ({
            subject: s.subject ?? '', html_body: s.html_body ?? '', template_id: s.template_id ?? '',
            delay_amount: s.delay_amount ?? 1, delay_unit: s.delay_unit ?? 'days',
            send_time: s.send_time ?? '', audience: s.audience ?? 'all',
          })),
        });
      })
      .catch(() => setError('Failed to load sequence'));
  }, [params.id]);

  if (error) return <div className="p-8"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div></div>;
  if (!initial) return <div className="p-8 text-gray-400 text-sm">Loading sequence...</div>;
  return <SequenceForm mode="edit" sequenceId={params.id} initial={initial} />;
}
