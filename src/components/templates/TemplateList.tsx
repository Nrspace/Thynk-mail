'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, Plus, Edit, Copy, Trash2, Eye, X,
  Loader2, Code, Calendar,
} from 'lucide-react';

interface Template {
  id: string; name: string; subject: string;
  html_body: string; text_body?: string;
  variables?: string[]; created_at: string; updated_at?: string;
}

function PreviewModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const [tab, setTab] = useState<'preview' | 'html'>('preview');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
          <div>
            <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{template.name}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Subject: {template.subject}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab toggle */}
            <div className="flex rounded-lg overflow-hidden border text-xs" style={{ borderColor: 'var(--card-border)' }}>
              <button
                onClick={() => setTab('preview')}
                className="px-3 py-1.5 flex items-center gap-1.5 transition-colors"
                style={{
                  background: tab === 'preview' ? 'var(--brand-primary)' : 'transparent',
                  color: tab === 'preview' ? '#fff' : 'var(--text-muted)',
                }}
              >
                <Eye size={12} /> Preview
              </button>
              <button
                onClick={() => setTab('html')}
                className="px-3 py-1.5 flex items-center gap-1.5 transition-colors"
                style={{
                  background: tab === 'html' ? 'var(--brand-primary)' : 'transparent',
                  color: tab === 'html' ? '#fff' : 'var(--text-muted)',
                }}
              >
                <Code size={12} /> HTML
              </button>
            </div>
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Variables bar */}
        {template.variables && template.variables.length > 0 && (
          <div className="px-6 py-2.5 border-b flex items-center gap-2 flex-wrap"
            style={{ borderColor: 'var(--card-border)', background: 'var(--table-head-bg)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Variables:</span>
            {template.variables.map((v: string) => (
              <span key={v} className="badge-blue text-xs font-mono">{`{{${v}}}`}</span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {tab === 'preview' ? (
            <iframe
              srcDoc={template.html_body || '<div style="padding:2rem;color:#6b7280;text-align:center">No HTML content</div>'}
              className="w-full h-full min-h-[500px] border-0"
              sandbox="allow-same-origin"
              title="Template preview"
            />
          ) : (
            <pre className="p-6 text-xs font-mono leading-relaxed overflow-auto whitespace-pre-wrap"
              style={{ color: 'var(--text-secondary)', background: 'var(--card-bg)' }}>
              {template.html_body || '(empty)'}
            </pre>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--card-border)' }}>
          <Link href={`/templates/${template.id}/edit`}
            className="btn-primary text-sm flex items-center gap-1.5">
            <Edit size={13} /> Edit Template
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TemplateList({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);

  async function handleDelete(t: Template) {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    setDeleting(t.id);
    try {
      await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  async function handleCopy(t: Template) {
    setCopying(t.id);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${t.name} (Copy)`,
          subject: t.subject,
          html_body: t.html_body,
          text_body: t.text_body ?? '',
        }),
      });
      const data = await res.json();
      if (data.id) router.push(`/templates/${data.id}/edit`);
      else alert(data.error ?? 'Failed to copy');
    } finally {
      setCopying(null);
      router.refresh();
    }
  }

  if (templates.length === 0) {
    return (
      <div className="card py-20 text-center text-gray-400">
        <FileText size={36} className="mx-auto mb-3 opacity-25" />
        <p className="font-medium">No templates yet</p>
        <p className="text-sm mt-1">Create reusable email templates</p>
        <Link href="/templates/new" className="btn-primary mt-5 inline-flex">
          <Plus size={14} /> Create Template
        </Link>
      </div>
    );
  }

  return (
    <>
      {preview && (
        <PreviewModal template={preview} onClose={() => setPreview(null)} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="card overflow-hidden flex flex-col hover:shadow-md transition-shadow group">
            {/* Preview thumbnail — click to expand */}
            <button
              onClick={() => setPreview(t)}
              className="relative w-full bg-gray-50 border-b border-gray-100 overflow-hidden text-left"
              style={{ height: 180 }}
              title="Click to preview"
            >
              {t.html_body ? (
                <iframe
                  srcDoc={t.html_body}
                  className="w-full border-0 pointer-events-none"
                  style={{ height: 600, transform: 'scale(0.3)', transformOrigin: 'top left', width: '333%' }}
                  sandbox="allow-same-origin"
                  title="Template thumbnail"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-300">
                  <FileText size={40} />
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="bg-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2 text-sm font-medium text-teal-700">
                  <Eye size={14} /> Preview
                </div>
              </div>
            </button>

            {/* Card body */}
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 leading-tight line-clamp-1">{t.name}</h3>
              </div>
              <p className="text-sm text-gray-500 truncate mb-2">{t.subject}</p>

              {t.variables && t.variables.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {t.variables.slice(0, 4).map((v: string) => (
                    <span key={v} className="badge-blue text-xs font-mono">{`{{${v}}}`}</span>
                  ))}
                  {t.variables.length > 4 && (
                    <span className="badge-gray text-xs">+{t.variables.length - 4} more</span>
                  )}
                </div>
              )}

              <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Calendar size={10} />
                  {new Date(t.created_at).toLocaleDateString()}
                </span>

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreview(t)}
                    className="p-1.5 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                    title="Preview"
                  >
                    <Eye size={14} />
                  </button>
                  <Link
                    href={`/templates/${t.id}/edit`}
                    className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit"
                  >
                    <Edit size={14} />
                  </Link>
                  <button
                    onClick={() => handleCopy(t)}
                    disabled={copying === t.id}
                    className="p-1.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
                    title="Duplicate"
                  >
                    {copying === t.id
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Copy size={14} />}
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    disabled={deleting === t.id}
                    className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deleting === t.id
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
