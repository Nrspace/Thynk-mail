'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2, Plus, MoveUp, MoveDown, Type, Image, Square, Minus, AlignLeft } from 'lucide-react';
import Link from 'next/link';

type BlockType = 'heading' | 'text' | 'button' | 'image' | 'divider' | 'spacer' | 'columns';

interface Block {
  id: string;
  type: BlockType;
  content: string;
  style: {
    color?: string;
    background?: string;
    fontSize?: string;
    textAlign?: string;
    padding?: string;
    buttonColor?: string;
    buttonUrl?: string;
    imageUrl?: string;
    imageAlt?: string;
    height?: string;
  };
}

const uid = () => Math.random().toString(36).slice(2, 9);

const BLOCK_DEFAULTS: Record<BlockType, Omit<Block, 'id'>> = {
  heading: { type: 'heading', content: 'Your Heading Here', style: { color: '#111827', fontSize: '28', textAlign: 'center', padding: '24', background: '#ffffff' } },
  text:    { type: 'text',    content: 'Hello {{first_name}},\n\nWrite your message here.', style: { color: '#374151', fontSize: '15', textAlign: 'left', padding: '16', background: '#ffffff' } },
  button:  { type: 'button',  content: 'Click Here', style: { textAlign: 'center', padding: '24', background: '#ffffff', buttonColor: '#14b8a6', buttonUrl: '#' } },
  image:   { type: 'image',   content: '', style: { padding: '16', background: '#ffffff', imageUrl: 'https://placehold.co/600x200/e2e8f0/94a3b8?text=Your+Image', imageAlt: 'Image' } },
  divider: { type: 'divider', content: '', style: { padding: '8', background: '#ffffff', color: '#e5e7eb' } },
  spacer:  { type: 'spacer',  content: '', style: { height: '32', background: '#ffffff' } },
  columns: { type: 'columns', content: 'Left column content|Right column content', style: { color: '#374151', fontSize: '14', padding: '16', background: '#ffffff' } },
};

const BLOCK_ICONS: Record<BlockType, React.ReactNode> = {
  heading: <Type size={14} />,
  text:    <AlignLeft size={14} />,
  button:  <Square size={14} />,
  image:   <Image size={14} />,
  divider: <Minus size={14} />,
  spacer:  <span style={{ fontSize: 12 }}>↕</span>,
  columns: <span style={{ fontSize: 12 }}>⊞</span>,
};

function renderBlockHtml(block: Block): string {
  const s = block.style;
  const pad = `${s.padding || 16}px`;
  const bg  = s.background || '#ffffff';
  switch (block.type) {
    case 'heading': return `<div style="background:${bg};padding:${pad};text-align:${s.textAlign||'center'}"><h1 style="margin:0;font-size:${s.fontSize||28}px;color:${s.color||'#111827'};font-family:sans-serif;">${block.content}</h1></div>`;
    case 'text':    return `<div style="background:${bg};padding:${pad}"><p style="margin:0;font-size:${s.fontSize||15}px;color:${s.color||'#374151'};line-height:1.7;font-family:sans-serif;text-align:${s.textAlign||'left'};white-space:pre-line;">${block.content}</p></div>`;
    case 'button':  return `<div style="background:${bg};padding:${pad};text-align:${s.textAlign||'center'}"><a href="${s.buttonUrl||'#'}" style="display:inline-block;padding:12px 32px;background:${s.buttonColor||'#14b8a6'};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:500;font-family:sans-serif;">${block.content}</a></div>`;
    case 'image':   return `<div style="background:${bg};padding:${pad}"><img src="${s.imageUrl}" alt="${s.imageAlt||''}" style="width:100%;height:auto;display:block;border-radius:4px;" /></div>`;
    case 'divider': return `<div style="background:${bg};padding:${pad}"><hr style="border:none;border-top:1px solid ${s.color||'#e5e7eb'};margin:0;" /></div>`;
    case 'spacer':  return `<div style="background:${bg};height:${s.height||32}px;"></div>`;
    case 'columns': {
      const [left, right] = block.content.split('|');
      return `<div style="background:${bg};padding:${pad}"><table style="width:100%;border-collapse:collapse;font-family:sans-serif;"><tr><td style="width:50%;padding:8px;vertical-align:top;font-size:${s.fontSize||14}px;color:${s.color||'#374151'};">${left||''}</td><td style="width:50%;padding:8px;vertical-align:top;font-size:${s.fontSize||14}px;color:${s.color||'#374151'};">${right||''}</td></tr></table></div>`;
    }
    default: return '';
  }
}

function buildFullHtml(blocks: Block[]): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:32px 16px;"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><tr><td>${blocks.map(renderBlockHtml).join('')}</td></tr></table></td></tr></table></body></html>`;
}

function BlockPreview({ block }: { block: Block }) {
  const s = block.style;
  const bg  = s.background || '#ffffff';
  const pad = `${s.padding || 16}px`;
  switch (block.type) {
    case 'heading': return <div style={{ background: bg, padding: pad, textAlign: (s.textAlign as 'left'|'center'|'right') || 'center' }}><h2 style={{ margin: 0, fontSize: `${Math.min(Number(s.fontSize||28),28)}px`, color: s.color||'#111827', fontFamily: 'sans-serif' }}>{block.content}</h2></div>;
    case 'text':    return <div style={{ background: bg, padding: pad }}><p style={{ margin: 0, fontSize: `${s.fontSize||15}px`, color: s.color||'#374151', lineHeight: 1.7, fontFamily: 'sans-serif', textAlign: (s.textAlign as 'left'|'center'|'right')||'left', whiteSpace: 'pre-line' }}>{block.content}</p></div>;
    case 'button':  return <div style={{ background: bg, padding: pad, textAlign: 'center' }}><span style={{ display:'inline-block', padding:'10px 28px', background: s.buttonColor||'#14b8a6', color:'#fff', borderRadius:6, fontSize:14, fontFamily:'sans-serif', cursor:'default' }}>{block.content}</span></div>;
    case 'image':   return <div style={{ background: bg, padding: pad }}><img src={s.imageUrl} alt={s.imageAlt||''} style={{ width:'100%', height:'auto', display:'block', borderRadius:4 }} /></div>;
    case 'divider': return <div style={{ background: bg, padding: pad }}><hr style={{ border:'none', borderTop:`1px solid ${s.color||'#e5e7eb'}`, margin:0 }} /></div>;
    case 'spacer':  return <div style={{ background: bg, height:`${s.height||32}px` }} />;
    case 'columns': {
      const [left, right] = block.content.split('|');
      return <div style={{ background: bg, padding: pad }}><div style={{ display:'flex', gap:16 }}><div style={{ flex:1, fontSize:`${s.fontSize||14}px`, color:s.color||'#374151', fontFamily:'sans-serif' }}>{left}</div><div style={{ flex:1, fontSize:`${s.fontSize||14}px`, color:s.color||'#374151', fontFamily:'sans-serif' }}>{right}</div></div></div>;
    }
    default: return null;
  }
}

function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const s = block.style;
  const set = (key: string, val: string) => onChange({ ...block, style: { ...s, [key]: val } });
  return (
    <div className="space-y-3 p-4">
      {block.type === 'text' && <div><label className="block text-xs font-medium text-gray-600 mb-1">Content</label><textarea className="input text-xs" rows={5} value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} /></div>}
      {block.type === 'heading' && <div><label className="block text-xs font-medium text-gray-600 mb-1">Heading Text</label><input className="input" value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} /></div>}
      {block.type === 'button' && <>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Button Label</label><input className="input" value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Button URL</label><input className="input" value={s.buttonUrl||''} onChange={e => set('buttonUrl', e.target.value)} placeholder="https://" /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Button Color</label><div className="flex gap-2 items-center"><input type="color" value={s.buttonColor||'#14b8a6'} onChange={e => set('buttonColor', e.target.value)} className="w-10 h-8 rounded border border-gray-200 cursor-pointer" /><input className="input flex-1" value={s.buttonColor||'#14b8a6'} onChange={e => set('buttonColor', e.target.value)} /></div></div>
      </>}
      {block.type === 'image' && <>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label><input className="input text-xs" value={s.imageUrl||''} onChange={e => set('imageUrl', e.target.value)} placeholder="https://..." /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Alt Text</label><input className="input" value={s.imageAlt||''} onChange={e => set('imageAlt', e.target.value)} /></div>
      </>}
      {block.type === 'spacer' && <div><label className="block text-xs font-medium text-gray-600 mb-1">Height (px)</label><input className="input" type="number" value={s.height||'32'} onChange={e => set('height', e.target.value)} /></div>}
      {block.type === 'columns' && <>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Left Column</label><textarea className="input text-xs" rows={3} value={block.content.split('|')[0]||''} onChange={e => onChange({ ...block, content: `${e.target.value}|${block.content.split('|')[1]||''}` })} /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Right Column</label><textarea className="input text-xs" rows={3} value={block.content.split('|')[1]||''} onChange={e => onChange({ ...block, content: `${block.content.split('|')[0]||''}|${e.target.value}` })} /></div>
      </>}
      {!['divider','spacer','image'].includes(block.type) && (
        <div className="grid grid-cols-2 gap-2">
          {['heading','text','columns'].includes(block.type) && <div><label className="block text-xs font-medium text-gray-600 mb-1">Text Color</label><div className="flex gap-1 items-center"><input type="color" value={s.color||'#111827'} onChange={e => set('color', e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" /><input className="input flex-1 text-xs" value={s.color||'#111827'} onChange={e => set('color', e.target.value)} /></div></div>}
          {['heading','text'].includes(block.type) && <div><label className="block text-xs font-medium text-gray-600 mb-1">Font Size</label><input className="input" type="number" value={s.fontSize||'15'} onChange={e => set('fontSize', e.target.value)} /></div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Background</label><div className="flex gap-1 items-center"><input type="color" value={s.background||'#ffffff'} onChange={e => set('background', e.target.value)} className="w-8 h-7 rounded border border-gray-200 cursor-pointer" /><input className="input flex-1 text-xs" value={s.background||'#ffffff'} onChange={e => set('background', e.target.value)} /></div></div>
        {block.type !== 'spacer' && <div><label className="block text-xs font-medium text-gray-600 mb-1">Padding (px)</label><input className="input" type="number" value={s.padding||'16'} onChange={e => set('padding', e.target.value)} /></div>}
      </div>
      {['heading','text','button'].includes(block.type) && (
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Alignment</label>
          <div className="flex gap-1">
            {['left','center','right'].map(a => (
              <button key={a} onClick={() => set('textAlign', a)}
                className={`flex-1 py-1.5 text-xs rounded border transition-colors ${s.textAlign === a ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {a.charAt(0).toUpperCase()+a.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PageProps { params: { id: string } }

export default function EditTemplatePage({ params }: PageProps) {
  const router = useRouter();
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [form, setForm]           = useState({ name: '', subject: '' });
  const [blocks, setBlocks]       = useState<Block[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab]             = useState<'design'|'html'>('design');

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;
  const BLOCK_TYPES: BlockType[] = ['heading','text','button','image','divider','spacer','columns'];

  useEffect(() => {
    fetch(`/api/templates/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setNotFound(true); setLoading(false); return; }
        setForm({ name: data.name, subject: data.subject });
        // Try to parse blocks from html, fallback to single text block
        if (data.html_body) {
          setBlocks([{
            id: uid(),
            type: 'text',
            content: data.html_body,
            style: { color: '#374151', fontSize: '14', padding: '16', background: '#ffffff' },
          }]);
        }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [params.id]);

  const addBlock = (type: BlockType) => {
    const nb = { ...BLOCK_DEFAULTS[type], id: uid() };
    setBlocks(prev => [...prev, nb]);
    setSelectedId(nb.id);
  };

  const updateBlock = (updated: Block) => setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
  const deleteBlock = (id: string) => { setBlocks(prev => prev.filter(b => b.id !== id)); setSelectedId(null); };
  const moveBlock = (id: string, dir: -1|1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx + dir < 0 || idx + dir >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx+dir]] = [arr[idx+dir], arr[idx]];
      return arr;
    });
  };

  const handleSave = async () => {
    if (!form.name || !form.subject) { alert('Name and subject are required'); return; }
    setSaving(true);
    try {
      const html_body = buildFullHtml(blocks);
      const variables = Array.from(new Set((html_body.match(/\{\{(\w+)\}\}/g)??[]).map(m => m.replace(/\{\{|\}\}/g,''))));
      const res = await fetch(`/api/templates/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, html_body, variables }),
      });
      const data = await res.json();
      if (data.id) router.push('/templates');
      else alert(data.error ?? 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-gray-400">Loading template...</div>;
  if (notFound) return (
    <div className="p-8 text-center">
      <p className="text-gray-500 mb-4">Template not found.</p>
      <Link href="/templates" className="btn-primary inline-flex">← Back to Templates</Link>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', background:'#fff', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href="/templates" style={{ color:'#9ca3af', textDecoration:'none', display:'flex' }}><ArrowLeft size={18} /></Link>
          <input
            style={{ border:'none', outline:'none', fontSize:16, fontWeight:600, color:'#111827', background:'transparent', width:220 }}
            placeholder="Template name..." value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <span style={{ color:'#d1d5db' }}>|</span>
          <input
            style={{ border:'none', outline:'none', fontSize:13, color:'#6b7280', background:'transparent', width:280 }}
            placeholder="Default subject line..." value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', border:'1px solid #e5e7eb', borderRadius:6, overflow:'hidden' }}>
            <button onClick={() => setTab('design')} style={{ padding:'6px 14px', fontSize:12, fontWeight:500, background: tab==='design'?'#0f766e':'#fff', color: tab==='design'?'#fff':'#6b7280', border:'none', cursor:'pointer' }}>Design</button>
            <button onClick={() => setTab('html')} style={{ padding:'6px 14px', fontSize:12, fontWeight:500, background: tab==='html'?'#0f766e':'#fff', color: tab==='html'?'#fff':'#6b7280', border:'none', cursor:'pointer' }}>HTML</button>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save size={13} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* 3-column layout */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Left — Blocks */}
        <div style={{ width:140, borderRight:'1px solid #e5e7eb', background:'#f9fafb', padding:'12px 8px', overflowY:'auto', flexShrink:0 }}>
          <p style={{ fontSize:10, fontWeight:600, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, paddingLeft:4 }}>Blocks</p>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {BLOCK_TYPES.map(type => (
              <button key={type} onClick={() => addBlock(type)}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:6, border:'1px solid #e5e7eb', background:'#fff', cursor:'pointer', fontSize:12, color:'#374151', textAlign:'left' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#14b8a6'; (e.currentTarget as HTMLButtonElement).style.color='#0f766e'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color='#374151'; }}>
                <span style={{ color:'#9ca3af' }}>{BLOCK_ICONS[type]}</span>
                {type.charAt(0).toUpperCase()+type.slice(1)}
                <Plus size={10} style={{ marginLeft:'auto', opacity:0.4 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Centre — Canvas */}
        <div style={{ flex:1, overflowY:'auto', background:'#f3f4f6', padding:24 }}>
          {tab === 'design' ? (
            <div style={{ maxWidth:600, margin:'0 auto', background:'#fff', borderRadius:8, overflow:'hidden', boxShadow:'0 1px 8px rgba(0,0,0,0.08)' }}>
              {blocks.length === 0 ? (
                <div style={{ padding:48, textAlign:'center', color:'#9ca3af' }}>
                  <p style={{ fontSize:14 }}>Click a block on the left to start building</p>
                </div>
              ) : blocks.map((block, idx) => (
                <div key={block.id} onClick={() => setSelectedId(block.id)}
                  style={{ position:'relative', cursor:'pointer', outline: selectedId===block.id ? '2px solid #14b8a6' : '2px solid transparent', outlineOffset:-2 }}>
                  <BlockPreview block={block} />
                  {selectedId === block.id && (
                    <div style={{ position:'absolute', top:4, right:4, display:'flex', gap:2, background:'#fff', borderRadius:4, border:'1px solid #e5e7eb', padding:2, boxShadow:'0 1px 4px rgba(0,0,0,0.1)' }}>
                      <button onClick={e => { e.stopPropagation(); moveBlock(block.id,-1); }} disabled={idx===0}
                        style={{ padding:3, background:'none', border:'none', cursor: idx===0?'not-allowed':'pointer', color:'#6b7280', opacity: idx===0?0.3:1 }}><MoveUp size={12} /></button>
                      <button onClick={e => { e.stopPropagation(); moveBlock(block.id,1); }} disabled={idx===blocks.length-1}
                        style={{ padding:3, background:'none', border:'none', cursor: idx===blocks.length-1?'not-allowed':'pointer', color:'#6b7280', opacity: idx===blocks.length-1?0.3:1 }}><MoveDown size={12} /></button>
                      <button onClick={e => { e.stopPropagation(); deleteBlock(block.id); }}
                        style={{ padding:3, background:'none', border:'none', cursor:'pointer', color:'#ef4444' }}><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ maxWidth:600, margin:'0 auto' }}>
              <textarea readOnly value={buildFullHtml(blocks)}
                style={{ width:'100%', height:'70vh', fontFamily:'monospace', fontSize:11, padding:16, border:'1px solid #e5e7eb', borderRadius:8, background:'#1e293b', color:'#94a3b8', resize:'none', lineHeight:1.6 }} />
            </div>
          )}
        </div>

        {/* Right — Editor */}
        <div style={{ width:240, borderLeft:'1px solid #e5e7eb', background:'#fff', overflowY:'auto', flexShrink:0 }}>
          {selectedBlock ? (
            <>
              <div style={{ padding:'10px 14px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ color:'#14b8a6' }}>{BLOCK_ICONS[selectedBlock.type]}</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#374151', textTransform:'capitalize' }}>{selectedBlock.type}</span>
              </div>
              <BlockEditor block={selectedBlock} onChange={updateBlock} />
            </>
          ) : (
            <div style={{ padding:20, textAlign:'center', color:'#9ca3af', marginTop:40 }}>
              <p style={{ fontSize:12, lineHeight:1.6 }}>Click any block in the canvas to edit it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
