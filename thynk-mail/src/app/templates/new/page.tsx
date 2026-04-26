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

  useEffect(() => {
    let mounted = true;
    import('grapesjs').then((mod) => {
      if (!mounted || !editorRef.current || gjsRef.current) return;
      const gjs = mod.default;
      const editor = gjs.init({
        container: editorRef.current,
        height: '500px',
        storageManager: false,
        blockManager: {
          appendTo: '#gjs-blocks',
          blocks: [
            { id: 'section', label: 'Section', content: '<section style="padding:20px;background:#ffffff;"><p>Section content</p></section>' },
            { id: 'text', label: 'Text', content: '<p style="font-size:14px;color:#333333;">Your text here</p>' },
            { id: 'button', label: 'Button', content: '<a href="#" style="display:inline-block;padding:12px 24px;background:#14b8a6;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">Click Here</a>' },
            { id: 'divider', label: 'Divider', content: '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />' },
            { id: 'image', label: 'Image', content: '<img src="https://placehold.co/600x200" style="width:100%;height:auto;" />' },
          ],
        },
        panels: { defaults: [] },
        styleManager: { appendTo: '#gjs-styles' },
      });
      gjsRef.current = editor;
    });
    return () => { mounted = false; };
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.subject) return alert('Name and subject are required');
    setSaving(true);
    try {
      let html = '';
      if (gjsRef.current) html = gjsRef.current.getHtml();
      const variables = [...(html.match(/\{\{(\w+)\}\}/g) ?? [])].map(m => m.replace(/\{\{|\}\}/g, ''));
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, html_body: html, variables }),
      });
      const data = await res.json();
      if (data.id) router.push('/templates');
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

      <div className="space-y-4 mb-6 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
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
      </div>

      {/* GrapesJS editor layout */}
      <div className="card overflow-hidden mb-6">
        <div className="flex">
          {/* Blocks panel */}
          <div id="gjs-blocks" className="w-40 shrink-0 bg-gray-50 border-r border-gray-100 p-2 min-h-96" />
          {/* Canvas */}
          <div className="flex-1">
            <div ref={editorRef} />
          </div>
          {/* Styles panel */}
          <div id="gjs-styles" className="w-56 shrink-0 bg-gray-50 border-l border-gray-100 p-2 min-h-96" />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          <Save size={14} /> {saving ? 'Saving...' : 'Save Template'}
        </button>
        <Link href="/templates" className="btn-secondary">Cancel</Link>
      </div>
    </div>
  );
}
