const paths = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4z" />
      <path d="M15 5v3m0 3v2m0 3v3" />
    </>
  ),
  cart: (
    <>
      <path d="M3 3h2l3 12h11l2-8H6" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  chart: <path d="M4 3v17h17M8 15l4-5 4 2 5-7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  edit: <path d="m16 3 5 5-12 12H4v-5zM13 6l5 5" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v5c0 4 16 4 16 0V5M4 10v5c0 4 16 4 16 0v-5M4 15v4c0 4 16 4 16 0v-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  external: <path d="M14 3h7v7m0-7-11 11M10 3H3v18h18v-7" />,
}
export function AdminIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
