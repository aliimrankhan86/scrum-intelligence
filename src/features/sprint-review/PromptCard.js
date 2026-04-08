import React, { useState } from 'react';

export default function PromptCard({
  colors,
  title,
  description,
  checklist,
  previewText,
  accentColor,
  onCopy,
}) {
  const [copied, setCopied] = useState(false);

  const triggerCopy = async (action) => {
    const ok = await action();
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const btnStyle = (active) => ({
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${accentColor}`,
    background: active
      ? 'rgba(22,163,74,0.12)'
      : accentColor,
    color: active
      ? '#4ade80'
      : '#fff',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  });

  return (
    <div
      style={{
        border: `1px solid ${colors.bd2}`,
        borderRadius: '12px',
        background: colors.bg1,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px 12px',
          borderBottom: `1px solid ${colors.bd}`,
          background: colors.bg3,
        }}
      >
        <div
          style={{
            fontSize: '15px',
            fontWeight: '700',
            color: colors.text0,
            marginBottom: '4px',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: '12px', color: colors.text1, lineHeight: 1.55 }}>
          {description}
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {Array.isArray(checklist) && checklist.length > 0 && (
          <div
            style={{
              marginBottom: '12px',
              borderRadius: '10px',
              border: `1px solid ${colors.bd}`,
              background: colors.bg0,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: '700',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: colors.text2,
                marginBottom: '8px',
              }}
            >
              This prompt will give you
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: '18px',
                color: colors.text1,
                fontSize: '12px',
                lineHeight: 1.65,
              }}
            >
              {checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div
          style={{
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.text2,
            marginBottom: '8px',
          }}
        >
          Prompt preview
        </div>
        <div
          style={{
            maxHeight: '220px',
            overflowY: 'auto',
            borderRadius: '10px',
            border: `1px solid ${colors.bd}`,
            background: colors.bg0,
            padding: '12px 14px',
            fontSize: '12px',
            lineHeight: 1.6,
            color: colors.text0,
            whiteSpace: 'pre-wrap',
          }}
        >
          {previewText}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            marginTop: '12px',
          }}
        >
          <button
            onClick={() => triggerCopy(onCopy)}
            style={btnStyle(copied)}
          >
            {copied ? '✓ Copied' : 'Copy prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}
