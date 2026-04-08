import React, { useState } from 'react';
import { INSIGHTS_CONFIG } from './config';
import { callAI } from './api';
import {
  DEFAULT_PROJECT_PROFILE,
  deriveProjectContextFromProfile,
  normaliseProjectProfile,
} from './projectProfile';

const C = {
  bg0:'var(--app-bg0)', bg1:'var(--app-bg1)', bg2:'var(--app-bg2)', bg3:'var(--app-bg3)',
  text0:'var(--app-text0)', text1:'var(--app-text1)', text2:'var(--app-text2)',
  bd:'var(--app-bd)', bd2:'var(--app-bd2)',
  blue:'var(--app-blue)', blueBg:'var(--app-blue-bg)',
  green:'var(--app-green)', greenBg:'var(--app-green-bg)',
  amber:'var(--app-amber)', amberBg:'var(--app-amber-bg)',
  red:'var(--app-red)', redBg:'var(--app-red-bg)',
};

function textValue(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text && text !== 'null' ? text : '';
}

function firstValue(...values) {
  return values.map(textValue).find(Boolean) || '';
}

function Spinner() {
  return (
    <span style={{ display:'inline-flex', gap:'3px', verticalAlign:'middle', marginLeft:'5px' }}>
      {[0,200,400].map(d => (
        <span key={d} style={{ width:'4px', height:'4px', borderRadius:'50%', background:'currentColor',
          animation:`sp 1.2s ${d}ms infinite`, opacity:.3 }} />
      ))}
      <style>{`@keyframes sp{0%,80%,100%{opacity:.2;transform:scale(.7)}40%{opacity:1;transform:scale(1)}}`}</style>
    </span>
  );
}

// Sprint card
function SprintCard({ sprint, maxPoints, maxTickets, isCurrent }) {
  const pointsPct = sprint.committedPoints
    ? Math.round((sprint.completedPoints / sprint.committedPoints) * 100)
    : null;
  const ticketsPct = sprint.committedTickets
    ? Math.round((sprint.completedTickets / sprint.committedTickets) * 100)
    : null;

  const borderColor = isCurrent ? C.amber : C.bd;

  return (
    <div style={{ background:C.bg2, border:`1px solid ${borderColor}`, borderRadius:'10px', padding:'14px', position:'relative' }}>
      {isCurrent && (
        <span style={{ position:'absolute', top:'10px', right:'10px', fontSize:'10px', fontWeight:'600',
          padding:'2px 8px', borderRadius:'20px', background:C.amberBg, color:'#fb923c' }}>
          current
        </span>
      )}
      <div style={{ fontSize:'12px', fontWeight:'600', color:C.text0, marginBottom:'12px' }}>{sprint.name}</div>

      {/* Story points */}
      <div style={{ marginBottom:'10px' }}>
        <div style={{ fontSize:'10px', fontWeight:'700', color:C.text2, textTransform:'uppercase',
          letterSpacing:'.06em', marginBottom:'6px' }}>Story points</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
          {[['Committed', sprint.committedPoints, C.text2],
            ['Completed', sprint.completedPoints, sprint.completedPoints >= sprint.committedPoints ? '#4ade80' : '#fb923c']
          ].map(([l,v,c]) => (
            <div key={l} style={{ background:C.bg3, borderRadius:'6px', padding:'8px 10px' }}>
              <div style={{ fontSize:'10px', color:C.text2, marginBottom:'2px' }}>{l}</div>
              <div style={{ fontSize:'18px', fontWeight:'700', color:c }}>{v ?? '—'}</div>
            </div>
          ))}
        </div>
        {pointsPct !== null && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ flex:1, height:'6px', background:C.bg3, borderRadius:'3px', overflow:'hidden' }}>
              <div style={{ width:`${Math.min(pointsPct,100)}%`, height:'100%', borderRadius:'3px',
                background: pointsPct >= 100 ? '#4ade80' : pointsPct >= 70 ? '#fb923c' : '#f87171',
                transition:'width .4s ease' }} />
            </div>
            <span style={{ fontSize:'11px', fontWeight:'600',
              color: pointsPct >= 100 ? '#4ade80' : pointsPct >= 70 ? '#fb923c' : '#f87171' }}>
              {pointsPct}%
            </span>
          </div>
        )}
      </div>

      {/* Tickets */}
      <div>
        <div style={{ fontSize:'10px', fontWeight:'700', color:C.text2, textTransform:'uppercase',
          letterSpacing:'.06em', marginBottom:'6px' }}>Tickets</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
          {[['Committed', sprint.committedTickets, C.text2],
            ['Completed', sprint.completedTickets, sprint.completedTickets >= sprint.committedTickets ? '#4ade80' : '#fb923c']
          ].map(([l,v,c]) => (
            <div key={l} style={{ background:C.bg3, borderRadius:'6px', padding:'8px 10px' }}>
              <div style={{ fontSize:'10px', color:C.text2, marginBottom:'2px' }}>{l}</div>
              <div style={{ fontSize:'18px', fontWeight:'700', color:c }}>{v ?? '—'}</div>
            </div>
          ))}
        </div>
        {ticketsPct !== null && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ flex:1, height:'6px', background:C.bg3, borderRadius:'3px', overflow:'hidden' }}>
              <div style={{ width:`${Math.min(ticketsPct,100)}%`, height:'100%', borderRadius:'3px',
                background: ticketsPct >= 100 ? '#4ade80' : ticketsPct >= 70 ? '#fb923c' : '#f87171',
                transition:'width .4s ease' }} />
            </div>
            <span style={{ fontSize:'11px', fontWeight:'600',
              color: ticketsPct >= 100 ? '#4ade80' : ticketsPct >= 70 ? '#fb923c' : '#f87171' }}>
              {ticketsPct}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Average card
function AvgCard({ label, value, sub, color }) {
  return (
    <div style={{ background:C.bg2, border:`1px solid ${C.bd}`, borderRadius:'10px', padding:'14px', textAlign:'center' }}>
      <div style={{ fontSize:'10px', fontWeight:'700', color:C.text2, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px' }}>{label}</div>
      <div style={{ fontSize:'28px', fontWeight:'700', color: color || C.text0, marginBottom:'4px' }}>{value ?? '—'}</div>
      <div style={{ fontSize:'11px', color:C.text2 }}>{sub}</div>
    </div>
  );
}

// Trend indicator
function Trend({ sprints, field }) {
  const vals = sprints.map(s => s[field]).filter(v => v != null);
  if (vals.length < 2) return null;
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const diff = last - prev;
  const up = diff > 0;
  return (
    <span style={{ fontSize:'11px', fontWeight:'600', marginLeft:'6px',
      color: up ? '#4ade80' : '#f87171' }}>
      {up ? '↑' : '↓'} {Math.abs(diff)} vs prev sprint
    </span>
  );
}

export default function Insights({ state, persist, onAIStatusChange }) {
  const [paste, setPaste] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const data = state.velocityData || { sprints: [], current: null, insights: [], recommendation: null };

  const avg = (field) => {
    const vals = (data.sprints || []).map(s => s[field]).filter(v => v != null && v > 0);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a,b) => a+b, 0) / vals.length);
  };

  const avgPoints = avg('completedPoints');
  const avgTickets = avg('completedTickets');
  const maxPoints = Math.max(...(data.sprints||[]).map(s=>s.committedPoints||0), data.current?.committedPoints||0, 1);
  const maxTickets = Math.max(...(data.sprints||[]).map(s=>s.committedTickets||0), data.current?.committedTickets||0, 1);
  const projectProfile = normaliseProjectProfile(state.projectProfile || DEFAULT_PROJECT_PROFILE);
  const fallbackContext = deriveProjectContextFromProfile(projectProfile);
  const insightRovoPrompt =
    typeof INSIGHTS_CONFIG.rovoPrompt === 'function'
      ? INSIGHTS_CONFIG.rovoPrompt({
          projectContext: state.projectContext || fallbackContext,
          projectProfile,
          sprint: (state.sprints || []).find((s) => s.num === state.activeSprint),
          nextSprint: [...(state.sprints || [])]
            .sort((a, b) => a.num - b.num)
            .find((s) => s.num > state.activeSprint) || null,
        })
      : INSIGHTS_CONFIG.rovoPrompt;

  const handleCopy = () => {
    navigator.clipboard.writeText(insightRovoPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const process = async () => {
    if (!paste.trim()) { setStatus('Paste Rovo response above first'); return; }
    if (!state.groqKey && !state.cerebrasKey) { setStatus('No API key — click ⚙ API keys'); return; }
    setLoading(true);
    setStatus('Processing...');
    try {
      let resolvedProvider = 'none';
      const parsed = await callAI(
        INSIGHTS_CONFIG.systemPrompt, paste,
        { groqKey: state.groqKey, cerebrasKey: state.cerebrasKey },
        (provider, msg, providers) => {
          onAIStatusChange?.(providers);
          if (provider === 'groq' || provider === 'cerebras') {
            resolvedProvider = provider;
          }
          setStatus(msg);
        }
      );
      const currentContext = state.projectContext || fallbackContext;
      const nextContext = {
        projectKey: firstValue(parsed?.context?.projectKey, currentContext.projectKey, fallbackContext.projectKey),
        epic: firstValue(parsed?.context?.epic, currentContext.epic, fallbackContext.epic),
        epicName: firstValue(parsed?.context?.epicName, currentContext.epicName, fallbackContext.epicName),
      };
      const sprintName = firstValue(parsed?.context?.sprintName);
      const nextSprints = sprintName
        ? (state.sprints || []).map((s) =>
            s.num === state.activeSprint ? { ...s, name: sprintName } : s,
          )
        : state.sprints;

      persist({
        sprints: nextSprints,
        projectContext: nextContext,
        velocityData: parsed,
        lastUpdated: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),
      });
      setPaste('');
      const providerLabel =
        resolvedProvider === 'groq'
          ? 'Updated with Groq'
          : resolvedProvider === 'cerebras'
            ? 'Updated with Cerebras'
            : 'Velocity updated';
      setStatus(parsed.summary ? `${providerLabel} · ${parsed.summary}` : providerLabel);
    } catch(e) {
      persist({ apiProvider: 'none' });
      setStatus('Error: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ display:'grid', gridTemplateColumns:'360px 1fr', overflow:'hidden', height:'100%', minHeight:0 }}>

      {/* Input */}
      <div style={{ background:C.bg1, borderRight:`1px solid ${C.bd}`, overflowY:'auto', display:'flex', flexDirection:'column', minHeight:0 }}>
        <div style={{ padding:'16px 18px 12px', borderBottom:`1px solid ${C.bd}`, position:'sticky', top:0, background:C.bg1, zIndex:5 }}>
          <div style={{ fontSize:'16px', fontWeight:'600', borderLeft:'3px solid #8b5cf6', paddingLeft:'10px' }}>Velocity &amp; insights</div>
        </div>
        <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:'14px' }}>

          <div style={{ border:`1px solid ${C.bd2}`, borderRadius:'10px', overflow:'hidden', background:C.bg0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:C.bg3 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'26px', height:'26px', borderRadius:'6px', background:'#0052cc',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:'#fff' }}>J</div>
                <div>
                  <div style={{ fontSize:'12px', fontWeight:'600', color:C.text0 }}>Jira Rovo Chat</div>
                  <div style={{ fontSize:'11px', color:C.text2 }}>Get velocity data for last 3 sprints</div>
                </div>
              </div>
              <button onClick={handleCopy}
                style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 14px', borderRadius:'6px',
                  border:'none', cursor:'pointer', fontSize:'12px', fontWeight:'700',
                  background: copied ? C.greenBg : '#0052cc', color: copied ? '#4ade80' : '#fff' }}>
                {copied ? '✓ Copied' : '⎘ Copy prompt'}
              </button>
            </div>
            <div style={{ height:'1px', background:C.bd }} />
            <textarea
              style={{ width:'100%', fontSize:'12px', padding:'10px 14px', border:'none', background:C.bg0,
                color:C.text0, resize:'vertical', fontFamily:'inherit', lineHeight:'1.55', minHeight:'100px', outline:'none' }}
              value={paste} onChange={e => setPaste(e.target.value)}
              placeholder="Paste Rovo's velocity response here..." />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px',
              background:C.bg3, borderTop:`1px solid ${C.bd}`, gap:'8px' }}>
              <span style={{ fontSize:'11px', color:C.text2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {loading ? <span>Processing<Spinner /></span> : status || 'Paste Rovo response above'}
              </span>
              <button onClick={process} disabled={loading}
                style={{ padding:'6px 16px', border:'none', borderRadius:'6px', cursor:'pointer',
                  fontSize:'12px', fontWeight:'700', background:'#0052cc', color:'#fff', opacity: loading ? 0.5 : 1 }}>
                Update
              </button>
            </div>
          </div>

          {/* What this section is for */}
          <div style={{ background:C.bg2, border:`1px solid ${C.bd}`, borderRadius:'8px', padding:'12px 14px' }}>
            <div style={{ fontSize:'11px', fontWeight:'600', color:C.text1, marginBottom:'6px' }}>What this shows you</div>
            <div style={{ fontSize:'11px', color:C.text2, lineHeight:'1.8' }}>
              • Average story points the team completes per sprint<br />
              • Average tickets completed per sprint<br />
              • Current sprint committed vs completed so far<br />
              • 3 coaching insights based on patterns<br />
              • RPA project recommendation (if relevant)
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard */}
      <div style={{ overflowY:'auto', background:C.bg0, minHeight:0 }}>
      <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:'14px', fontWeight:'600' }}>Sprint velocity</span>
          <span style={{ fontSize:'11px', color:C.text2 }}>Based on last 3 sprints</span>
        </div>

        {/* Averages */}
        {(avgPoints || avgTickets) ? (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            <AvgCard
              label="Avg story points / sprint"
              value={avgPoints}
              sub={<>avg completed · <Trend sprints={data.sprints||[]} field="completedPoints" /></>}
              color="#a78bfa"
            />
            <AvgCard
              label="Avg tickets / sprint"
              value={avgTickets}
              sub={<>avg completed · <Trend sprints={data.sprints||[]} field="completedTickets" /></>}
              color="#67e8f9"
            />
          </div>
        ) : (
          <div style={{ background:C.bg2, border:`1px solid ${C.bd}`, borderRadius:'10px', padding:'20px', textAlign:'center', color:C.text2, fontSize:'12px' }}>
            Copy the Rovo prompt, paste the response, and click Update to see velocity data
          </div>
        )}

        {/* Current sprint commitment */}
        {data.current && (
          <div style={{ background:C.bg2, border:`1px solid rgba(217,119,6,0.3)`, borderRadius:'10px', padding:'14px' }}>
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#fb923c', marginBottom:'10px' }}>
              {data.current.name} — current sprint commitment
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
              {[
                ['Committed pts', data.current.committedPoints, C.text1],
                ['Completed pts', data.current.completedPoints, data.current.completedPoints >= (data.current.committedPoints||0) ? '#4ade80' : '#fb923c'],
                ['Committed tickets', data.current.committedTickets, C.text1],
                ['Completed tickets', data.current.completedTickets, data.current.completedTickets >= (data.current.committedTickets||0) ? '#4ade80' : '#fb923c'],
              ].map(([l,v,c]) => (
                <div key={l} style={{ background:C.bg3, borderRadius:'6px', padding:'10px' }}>
                  <div style={{ fontSize:'10px', color:C.text2, marginBottom:'4px' }}>{l}</div>
                  <div style={{ fontSize:'18px', fontWeight:'700', color:c }}>{v ?? '—'}</div>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            {data.current.committedPoints && data.current.completedPoints != null && (
              <div style={{ marginTop:'10px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ fontSize:'11px', color:C.text2 }}>Sprint progress (story points)</span>
                  <span style={{ fontSize:'11px', fontWeight:'600', color:'#fb923c' }}>
                    {Math.round((data.current.completedPoints/data.current.committedPoints)*100)}%
                  </span>
                </div>
                <div style={{ height:'8px', background:C.bg3, borderRadius:'4px', overflow:'hidden' }}>
                  <div style={{
                    width:`${Math.min(100, Math.round((data.current.completedPoints/data.current.committedPoints)*100))}%`,
                    height:'100%', borderRadius:'4px', background:'#fb923c', transition:'width .4s ease'
                  }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sprint cards */}
        {(data.sprints||[]).length > 0 && (
          <>
            <div style={{ fontSize:'12px', fontWeight:'600', color:C.text1, marginTop:'4px' }}>Sprint breakdown</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
              {(data.sprints||[]).map(s => (
                <SprintCard key={s.num} sprint={s} maxPoints={maxPoints} maxTickets={maxTickets} isCurrent={false} />
              ))}
            </div>
          </>
        )}

        {/* Coaching insights */}
        {(data.insights||[]).length > 0 && (
          <div style={{ background:C.bg2, border:`1px solid rgba(139,92,246,0.3)`, borderRadius:'10px', overflow:'hidden' }}>
            <div style={{ padding:'9px 14px', background:'rgba(139,92,246,0.08)', borderBottom:`1px solid rgba(139,92,246,0.2)`, display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'12px', fontWeight:'600', color:'#c4b5fd' }}>Coaching insights</span>
              <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background:'rgba(139,92,246,0.2)', color:'#a78bfa' }}>
                {data.insights.length} of 3
              </span>
            </div>
            {data.insights.map((ins, i) => (
              <div key={i} style={{ padding:'10px 14px', borderBottom: i < data.insights.length-1 ? `1px solid ${C.bd}` : 'none',
                display:'flex', gap:'10px', alignItems:'flex-start' }}>
                <span style={{ fontSize:'11px', fontWeight:'700', color:'#a78bfa', minWidth:'18px', marginTop:'1px' }}>{i+1}.</span>
                <span style={{ fontSize:'12px', color:C.text0, lineHeight:'1.55' }}>{ins}</span>
              </div>
            ))}
          </div>
        )}

        {/* RPA recommendation */}
        {data.recommendation && (
          <div style={{ background:C.bg2, border:`1px solid rgba(8,145,178,0.3)`, borderRadius:'10px', padding:'14px' }}>
            <div style={{ fontSize:'11px', fontWeight:'700', color:'#67e8f9', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px' }}>
              RPA project recommendation
            </div>
            <div style={{ fontSize:'12px', color:C.text0, lineHeight:'1.6' }}>{data.recommendation}</div>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
