import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = 'https://krapteremailtool.onrender.com/api';

// ─── Status Badge ─────────────────────────────────────────────
const STATUS = {
  sent:      { label: '📤 Sent',       color: '#6b7280', bg: '#f3f4f6' },
  delivered: { label: '✅ Delivered',  color: '#2563eb', bg: '#eff6ff' },
  opened:    { label: '👁️ Opened',     color: '#059669', bg: '#ecfdf5' },
  replied:   { label: '↩️ Replied',    color: '#7c3aed', bg: '#f5f3ff' },
};

function Badge({ status }) {
  const s = STATUS[status] || STATUS.sent;
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap'
    }}>{s.label}</span>
  );
}

// ─── Compose Modal ────────────────────────────────────────────
function ComposeModal({ onClose, onSent }) {
  const [form, setForm]     = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [error, setError]   = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const send = async () => {
    if (!form.to || !form.subject || !form.body) {
      setError('Saare fields fill karo'); return;
    }
    setSending(true); setError('');
    try {
      await axios.post(`${API}/send`, form);
      onSent(); onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Send failed — server check karo');
    }
    setSending(false);
  };

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:200
    }}>
      <div style={{
        background:'#fff', borderRadius:16, padding:32,
        width:500, boxShadow:'0 24px 64px rgba(0,0,0,0.25)',
        maxHeight:'90vh', overflowY:'auto'
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h2 style={{ margin:0, fontSize:20, fontWeight:700 }}>✉️ New Tracked Email</h2>
          <button onClick={onClose} style={{ border:'none', background:'none', fontSize:22, cursor:'pointer', color:'#6b7280' }}>×</button>
        </div>

        {error && (
          <div style={{ background:'#fef2f2', color:'#dc2626', padding:'10px 14px', borderRadius:8, marginBottom:16, fontSize:13 }}>
            ⚠️ {error}
          </div>
        )}

        {[
          { key:'to',      label:'To (Email address)', placeholder:'example@gmail.com', type:'email' },
          { key:'subject', label:'Subject',             placeholder:'Email ka subject...', type:'text' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5 }}>
              {f.label}
            </label>
            <input
              type={f.type}
              value={form[f.key]}
              onChange={set(f.key)}
              placeholder={f.placeholder}
              style={{
                width:'100%', padding:'10px 12px',
                border:'1.5px solid #e5e7eb', borderRadius:8,
                fontSize:14, boxSizing:'border-box', outline:'none',
                transition:'border 0.2s'
              }}
              onFocus={e => e.target.style.borderColor='#2563eb'}
              onBlur={e  => e.target.style.borderColor='#e5e7eb'}
            />
          </div>
        ))}

        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5 }}>
            Message Body
          </label>
          <textarea
            value={form.body}
            onChange={set('body')}
            placeholder="Apna message yahan likho..."
            rows={7}
            style={{
              width:'100%', padding:'10px 12px',
              border:'1.5px solid #e5e7eb', borderRadius:8,
              fontSize:14, resize:'vertical', boxSizing:'border-box', outline:'none',
              fontFamily:'inherit', lineHeight:1.6
            }}
            onFocus={e => e.target.style.borderColor='#2563eb'}
            onBlur={e  => e.target.style.borderColor='#e5e7eb'}
          />
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{
            padding:'10px 22px', borderRadius:8, border:'1.5px solid #e5e7eb',
            background:'#fff', cursor:'pointer', fontSize:14, fontWeight:500
          }}>Cancel</button>
          <button onClick={send} disabled={sending} style={{
            padding:'10px 22px', borderRadius:8, border:'none',
            background: sending ? '#93c5fd' : '#2563eb',
            color:'#fff', fontWeight:700, cursor: sending ? 'not-allowed' : 'pointer', fontSize:14,
            transition:'background 0.2s'
          }}>
            {sending ? '⏳ Bhej raha hai...' : '🚀 Send & Track'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────
function DetailModal({ emailId, onClose, onDelete }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    axios.get(`${API}/emails/${emailId}`)
      .then(r => setData(r.data))
      .catch(() => onClose());
  }, [emailId, onClose]);

  if (!data) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:40, fontSize:16 }}>⏳ Load ho raha hai...</div>
    </div>
  );

  const { email, opens } = data;
  const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' }) : '—';

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
      <div style={{
        background:'#fff', borderRadius:16, padding:32,
        width:540, maxHeight:'85vh', overflowY:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,0.25)'
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700 }}>📋 Email Detail</h2>
          <button onClick={onClose} style={{ border:'none', background:'none', fontSize:22, cursor:'pointer', color:'#6b7280' }}>×</button>
        </div>

        {/* Email Info */}
        <div style={{ background:'#f9fafb', borderRadius:10, padding:18, marginBottom:20 }}>
          {[
            { label:'To',           value: email.to_email },
            { label:'Subject',      value: email.subject },
            { label:'Status',       value: <Badge status={email.status} /> },
            { label:'Sent',         value: fmt(email.sent_at) },
            { label:'Open Count',   value: <span style={{ fontWeight:700, color: email.open_count > 0 ? '#059669' : '#9ca3af' }}>{email.open_count} baar</span> },
            { label:'Pehli baar',   value: fmt(email.first_opened) },
            { label:'Aakhri baar',  value: fmt(email.last_opened) },
            { label:'Reply',        value: fmt(email.replied_at) },
          ].map(row => (
            <div key={row.label} style={{ display:'flex', gap:12, marginBottom:10, alignItems:'center' }}>
              <span style={{ fontSize:12, fontWeight:600, color:'#6b7280', minWidth:90 }}>{row.label}</span>
              <span style={{ fontSize:14, color:'#111' }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* Open History */}
        {opens.length > 0 && (
          <>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#374151', marginBottom:12 }}>
              👁️ Open History ({opens.length} baar)
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {opens.map((o, i) => (
                <div key={i} style={{
                  padding:'10px 14px', borderRadius:8,
                  background: i === 0 ? '#ecfdf5' : '#f9fafb',
                  border:`1px solid ${i === 0 ? '#6ee7b7' : '#e5e7eb'}`
                }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>
                    {i === 0 ? '🟢 ' : ''}{fmt(o.opened_at)}
                  </div>
                  <div style={{ fontSize:11, color:'#9ca3af', marginTop:3, wordBreak:'break-all' }}>
                    {o.user_agent || 'Unknown device'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Delete Button */}
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button onClick={() => { onDelete(email.id); onClose(); }} style={{
            padding:'8px 18px', borderRadius:8, border:'1.5px solid #fecaca',
            background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontSize:13, fontWeight:600
          }}>
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [emails,      setEmails]      = useState([]);
  const [stats,       setStats]       = useState({ total:0, delivered:0, opened:0, replied:0, total_opens:0 });
  const [showCompose, setShowCompose] = useState(false);
  const [selectedId,  setSelectedId]  = useState(null);
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState('all');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const [emailsRes, statsRes] = await Promise.all([
        axios.get(`${API}/emails`),
        axios.get(`${API}/stats`),
      ]);
      setEmails(emailsRes.data || []);
      setStats(statsRes.data  || {});
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Load failed:', e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]);

  const deleteEmail = async (id) => {
    await axios.delete(`${API}/emails/${id}`);
    load();
  };

  // Filter + Search
  const filtered = emails
    .filter(e => filter === 'all' || e.status === filter)
    .filter(e =>
      !search ||
      e.to_email.toLowerCase().includes(search.toLowerCase()) ||
      e.subject.toLowerCase().includes(search.toLowerCase())
    );

  const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' }) : '—';

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', minHeight:'100vh', background:'#f1f5f9' }}>

      {showCompose && (
        <ComposeModal onClose={() => setShowCompose(false)} onSent={load} />
      )}
      {selectedId && (
        <DetailModal
          emailId={selectedId}
          onClose={() => setSelectedId(null)}
          onDelete={deleteEmail}
        />
      )}

      {/* Header */}
      <div style={{
        background:'#1e293b', color:'#fff',
        padding:'0 32px', height:60,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        boxShadow:'0 2px 8px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>📧</span>
          <span style={{ fontSize:18, fontWeight:700 }}>Email Tracker</span>
          <span style={{ fontSize:11, color:'#94a3b8', marginLeft:8 }}>
            Last updated: {lastRefresh.toLocaleTimeString('en-IN')}
          </span>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          style={{
            background:'#2563eb', color:'#fff', border:'none',
            borderRadius:8, padding:'8px 20px',
            fontWeight:700, cursor:'pointer', fontSize:14
          }}>
          + New Email
        </button>
      </div>

      <div style={{ maxWidth:960, margin:'0 auto', padding:'28px 16px' }}>

        {/* Stats Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginBottom:28 }}>
          {[
            { label:'Total Sent',    value: stats.total,        icon:'📤', color:'#1e293b', bg:'#fff' },
            { label:'Delivered',     value: stats.delivered,    icon:'✅', color:'#2563eb', bg:'#eff6ff' },
            { label:'Opened',        value: stats.opened,       icon:'👁️', color:'#059669', bg:'#ecfdf5' },
            { label:'Replied',       value: stats.replied,      icon:'↩️', color:'#7c3aed', bg:'#f5f3ff' },
            { label:'Total Opens',   value: stats.total_opens || 0, icon:'🔢', color:'#d97706', bg:'#fffbeb' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius:12, padding:'16px 18px',
              border:'1px solid #e2e8f0', boxShadow:'0 1px 3px rgba(0,0,0,0.06)'
            }}>
              <div style={{ fontSize:22 }}>{s.icon}</div>
              <div style={{ fontSize:26, fontWeight:800, color:s.color, marginTop:4 }}>{s.value ?? 0}</div>
              <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search + Filter Bar */}
        <div style={{ display:'flex', gap:12, marginBottom:16, alignItems:'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search by email or subject..."
            style={{
              flex:1, padding:'9px 14px', border:'1.5px solid #e2e8f0',
              borderRadius:8, fontSize:14, outline:'none', background:'#fff'
            }}
          />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              padding:'9px 14px', border:'1.5px solid #e2e8f0',
              borderRadius:8, fontSize:14, background:'#fff', cursor:'pointer', outline:'none'
            }}>
            <option value="all">All Status</option>
            <option value="delivered">Delivered</option>
            <option value="opened">Opened</option>
            <option value="replied">Replied</option>
          </select>
          <button onClick={load} style={{
            padding:'9px 14px', borderRadius:8, border:'1.5px solid #e2e8f0',
            background:'#fff', cursor:'pointer', fontSize:14
          }}>🔄</button>
        </div>

        {/* Emails Table */}
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['To', 'Subject', 'Status', 'Opens', 'Sent At', 'Action'].map(h => (
                  <th key={h} style={{
                    padding:'12px 16px', textAlign:'left',
                    fontSize:12, fontWeight:700, color:'#64748b',
                    borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign:'center', padding:56, color:'#94a3b8', fontSize:15 }}>
                    {emails.length === 0
                      ? '📭 Koi email nahi bheja abhi tak — "New Email" button dabao!'
                      : '🔍 Koi email nahi mili is filter mein'}
                  </td>
                </tr>
              ) : filtered.map((email, i) => (
                <tr key={email.id}
                  style={{ borderBottom: i < filtered.length-1 ? '1px solid #f1f5f9' : 'none', transition:'background 0.15s', cursor:'default' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                  <td style={{ padding:'13px 16px', fontSize:14, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {email.to_email}
                  </td>
                  <td style={{ padding:'13px 16px', fontSize:14, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#374151' }}>
                    {email.subject}
                  </td>
                  <td style={{ padding:'13px 16px' }}>
                    <Badge status={email.status} />
                  </td>
                  <td style={{ padding:'13px 16px', fontSize:14, fontWeight:700, color: email.open_count > 0 ? '#059669' : '#cbd5e1' }}>
                    {email.open_count > 0 ? `${email.open_count}×` : '—'}
                  </td>
                  <td style={{ padding:'13px 16px', fontSize:13, color:'#64748b', whiteSpace:'nowrap' }}>
                    {fmt(email.sent_at)}
                  </td>
                  <td style={{ padding:'13px 16px' }}>
                    <button
                      onClick={() => setSelectedId(email.id)}
                      style={{
                        background:'#eff6ff', color:'#2563eb', border:'none',
                        borderRadius:6, padding:'5px 14px', cursor:'pointer',
                        fontSize:12, fontWeight:600
                      }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#94a3b8' }}>
          Auto-refresh har 10 seconds mein • {filtered.length} email{filtered.length !== 1 ? 's' : ''} dikh rahe hain
        </div>
      </div>
    </div>
  );
}