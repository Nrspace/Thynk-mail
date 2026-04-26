'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

export default function NewTemplatePage() {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gjsRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', subject: '', text_body: '' });
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    if (gjsRef.current) return;

    // Load GrapesJS CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/grapesjs/dist/css/grapes.min.css';
    document.head.appendChild(link);

    import('grapesjs').then((mod) => {
      if (!editorRef.current || gjsRef.current) return;
      const gjs = mod.default;

      const editor = gjs.init({
        container: editorRef.current,
        height: '520px',
        width: '100%',
        storageManager: false,
        panels: { defaults: [] },
        blockManager: {
          blocks: [
            {
              id: 'section',
              label: 'Section',
              content: `<section style="padding:24px;background:#ffffff;">
                <h2 style="font-size:22px;color:#111827;margin:0 0 12px;">Section Title</h2>
                <p style="font-size:14px;color:#6b7280;line-height:1.6;">Your content here.</p>
              </section>`,
            },
            {
              id: 'text',
              label: 'Text',
              content: '<p style="font-size:14px;color:#374151;line-height:1.7;">Your text here</p>',
            },
            {
              id: 'button',
              label: 'Button',
              content: '<a href="#" style="display:inline-block;padding:12px 28px;background:#14b8a6;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">Click Here</a>',
            },
            {
              id: 'image',
              label: 'Image',
              content: '<img src="https://placehold.co/600x200/e2e8f0/94a3b8?text=Your+Image" style="width:100%;height:auto;display:block;" />',
            },
            {
              id: 'divider',
              label: 'Divider',
              content: '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />',
            },
            {
              id: 'spacer',
              label: 'Spacer',
              content: '<div style="height:32px;"></div>',
            },
          ],
        },
      });

      gjsRef.current = editor;
      setEditorReady(true);
    });

    return () => { document.head.removeChild(link); };
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.subject) {
      alert('Template name and subject are required');
      return;
    }
    setSaving(true);
    try {
      let html = '';
      if (gjsRef.current) html = gjsRef.current.getHtml();
      const variables = [...new Set(
        (html.match(/\{\{(\w+)\}\}/g) ?? []).map((m: string) => m.replace(/\{\{|\}\}/g, ''))
      )];
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, html_body: html, variables }),
      });
      const data = await res.json();
      if (data.id) router.push('/templates');
      else alert(data.error ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/templates" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-semibold">New Template</h1>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-2 gap-4 max-w-2xl mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
          <input className="input" placeholder="e.g. Welcome Email"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Subject</label>
          <input className="input" placeholder="e.g. Welcome to {{company_name}}"
            value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
        </div>
      </div>

      {/* Editor */}
      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Email Designer</p>
          <p className="text-xs text-gray-400">
            Drag blocks from the left panel into the canvas
          </p>
        </div>
        {!editorReady && (
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
            Loading editor...
          </div>
        )}
        <div ref={editorRef} />
      </div>

      {/* Variables hint */}
      <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-700 max-w-2xl mb-6">
        Use <code className="font-mono bg-blue-100 px-1 rounded">{'{{first_name}}'}</code>,{' '}
        <code className="font-mono bg-blue-100 px-1 rounded">{'{{last_name}}'}</code>,{' '}
        <code className="font-mono bg-blue-100 px-1 rounded">{'{{email}}'}</code> anywhere in the template for personalisation.
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Template'}
        </button>
        <Link href="/templates" className="btn-secondary">Cancel</Link>
      </div>
    </div>
  );
}
