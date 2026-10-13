const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const IconDesk = p => <svg {...base} {...p}><path d="M2 3h5v5H2zM9 3h5v3H9zM9 8h5v5H9zM2 10h5v3H2z" /></svg>
export const IconBoard = p => <svg {...base} {...p}><rect x="2" y="2.5" width="3.4" height="11" rx="1" /><rect x="6.3" y="2.5" width="3.4" height="7.5" rx="1" /><rect x="10.6" y="2.5" width="3.4" height="4.5" rx="1" /></svg>
export const IconCalls = p => <svg {...base} {...p}><path d="M3 2.5h10v11H3z" /><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" /></svg>
export const IconArrow = p => <svg {...base} width="12" height="12" {...p}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
export const IconBack = p => <svg {...base} width="12" height="12" {...p}><path d="M13 8H3M7 4L3 8l4 4" /></svg>
export const IconClock = p => <svg {...base} width="13" height="13" {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.2 1.5" /></svg>
export const IconCopy = p => <svg {...base} width="14" height="14" {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1.2" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></svg>
export const IconDownload = p => <svg {...base} width="14" height="14" {...p}><path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" /></svg>
export const IconUpload = p => <svg {...base} width="22" height="22" strokeWidth="1.3" {...p}><path d="M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 10v3.5h11V10" /></svg>

export const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="#0B5D5E" />
    <path d="M7 16h4l2.5-6 4 12 2.5-6H25" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
