'use client';
import { useState } from 'react';
import { Save, Info } from 'lucide-react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    team_name: 'My Team',
    default_from_name: '',
    default_from_email: '',
    rate_delay_ms: 1200,
    bounce_webhook_url: '',
  });

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/bounce`
    : '/api/webhooks/bounce';

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Platform configuration</p>
      </div>

      <div className="space-y-6">
        {/* Team */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Team</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
            <input className="input" value={form.team_name} onChange={e => set('team_name', e.target.value)} />
          </div>
        </div>

        {/* Send Defaults */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Send Defaults</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default From Name</label>
              <input className="input" placeholder="Your Company" value={form.default_from_name}
                onChange={e => set('default_from_name', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default From Email</label>
              <input className="input" placeholder="hello@yourcompany.com" value={form.default_from_email}
                onChange={e => set('default_from_email', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rate Delay (ms between emails)
            </label>
            <input className="input" type="number" min={200} max={10000} value={form.rate_delay_ms}
              onChange={e => set('rate_delay_ms', Number(e.target.value))} />
            <p className="text-xs text-gray-400 mt-1">
              1200ms = ~50 emails/min. Lower = faster but higher spam risk.
            </p>
          </div>
        </div>

        {/* Webhooks */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Bounce Webhook</h2>
          <div className="bg-blue-50 rounded-lg px-4 py-3 flex gap-2 text-sm text-blue-700">
            <Info size={15} className="shrink-0 mt-0.5" />
            <div>
              Configure your email provider to POST bounce and complaint events to this URL.
              This auto-suppresses bad addresses and protects your sender reputation.
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
            <div className="flex gap-2">
              <input className="input font-mono text-xs bg-gray-50" readOnly value={webhookUrl} />
              <button
                className="btn-secondary shrink-0"
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
              >
                Copy
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Expected payload format:</p>
            <pre className="text-xs bg-gray-50 rounded-lg p-3 text-gray-600 overflow-auto">{`{
  "type": "bounce",  // or "complaint"
  "email": "user@example.com",
  "message_id": "<optional-message-id>"
}`}</pre>
          </div>
        </div>

        {/* Inbox Delivery Tips */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Inbox Delivery Checklist</h2>
          <div className="space-y-3">
            {[
              { label: 'SPF record', desc: 'Add v=spf1 include:your-provider ~all to your DNS' },
              { label: 'DKIM signing', desc: 'Enable in your email provider settings' },
              { label: 'DMARC policy', desc: 'Add v=DMARC1; p=none; rua=mailto:you@domain.com' },
              { label: 'Warm up accounts', desc: 'Start at 20/day, double weekly until target volume' },
              { label: 'Clean lists before sending', desc: 'Remove role addresses, hard bounces immediately' },
              { label: 'Unsubscribe header', desc: 'Automatically added to every outgoing email ✓' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSave} className="btn-primary">
          <Save size={14} />
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
