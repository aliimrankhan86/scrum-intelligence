import React from 'react';

const FIELD_CONFIG = [
  ['reviewNote', 'Optional review note', 'Only use if there is something important that Rovo will not know, such as audience emphasis or a presenter note', 'textarea'],
  ['wordingNote', 'Optional wording note', 'Only use if there is wording to soften, avoid, or handle carefully', 'textarea'],
];

export default function SprintReviewForm({
  colors,
  sprint,
  projectProfile,
  projectContext,
  value,
  onChange,
}) {
  const updateField = (field, nextValue) => onChange({ [field]: nextValue });
  const workstreams = Array.isArray(projectProfile?.workstreams) ? projectProfile.workstreams : [];

  return (
    <div
      style={{
        border: `1px solid ${colors.bd2}`,
        borderRadius: '12px',
        background: colors.bg1,
        padding: '16px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          lineHeight: 1.6,
          color: colors.text1,
          marginBottom: '14px',
        }}
      >
        Usually leave these blank. Use them only when you need to add context Rovo will not know, or when you need to steer the wording.
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '14px',
        }}
      >
        {[
          `Sprint hint: ${sprint?.name || `Sprint ${sprint?.num || ''}`.trim()}`,
          `Date hint: ${sprint?.start || '?'} to ${sprint?.end || '?'}`,
          `Primary epic: ${projectContext?.epic || '?'}${projectContext?.epicName ? ` — ${projectContext.epicName}` : ''}`,
          workstreams.length ? `Workstreams: ${workstreams.map((item) => [item?.epic, item?.epicName].filter(Boolean).join(' — ')).join(' | ')}` : null,
          `Locked format: ${projectProfile?.reviewDeckReference || 'Review deck reference'}`,
        ].filter(Boolean).map((chip) => (
          <span
            key={chip}
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              background: colors.bg3,
              border: `1px solid ${colors.bd}`,
              fontSize: '11px',
              color: colors.text1,
            }}
          >
            {chip}
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
        }}
      >
        {FIELD_CONFIG.map(([field, label, hint, type]) => (
          <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: colors.text0 }}>
              {label}
            </span>
            {type === 'textarea' ? (
              <textarea
                value={
                  value[field] ||
                  (field === 'reviewNote'
                    ? value.knownNote || value.stakeholderInstruction || ''
                    : value.sensitiveWordingNote || '')
                }
                onChange={(e) => updateField(field, e.target.value)}
                placeholder={hint}
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: '10px',
                  border: `1px solid ${colors.bd2}`,
                  background: colors.bg0,
                  color: colors.text0,
                  padding: '10px 12px',
                  resize: 'vertical',
                  fontSize: '12px',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  outline: 'none',
                }}
              />
            ) : (
              <input
                value={value[field] || ''}
                onChange={(e) => updateField(field, e.target.value)}
                placeholder={hint}
                style={{
                  width: '100%',
                  borderRadius: '10px',
                  border: `1px solid ${colors.bd2}`,
                  background: colors.bg0,
                  color: colors.text0,
                  padding: '10px 12px',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            )}
            <span style={{ fontSize: '11px', color: colors.text2 }}>
              {hint}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
