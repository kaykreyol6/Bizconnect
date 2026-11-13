export const state = {
  me: null,
  stats: null,
  compliance: { signed: false, agreement: null },
  industries: [],
  unread: 0,
};

export function industryLabel(slug) {
  const i = state.industries.find((x) => x.slug === slug);
  return i ? `${i.icon} ${i.label}` : '';
}

export function place(o) {
  return [o.city, o.region, o.country].filter(Boolean).join(', ');
}
