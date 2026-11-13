'use strict';

const INDUSTRIES = [
  { slug: 'technology', label: 'Technology', icon: '💻' },
  { slug: 'healthcare', label: 'Healthcare', icon: '🏥' },
  { slug: 'construction', label: 'Construction', icon: '🏗️' },
  { slug: 'agriculture', label: 'Agriculture', icon: '🌾' },
  { slug: 'education', label: 'Education', icon: '📚' },
  { slug: 'logistics', label: 'Logistics', icon: '🚢' },
  { slug: 'fashion', label: 'Fashion', icon: '👗' },
  { slug: 'food', label: 'Food & Bev', icon: '🍽️' },
  { slug: 'legal', label: 'Legal', icon: '⚖️' },
  { slug: 'finance', label: 'Finance', icon: '💰' },
  { slug: 'creative', label: 'Creative', icon: '🎨' },
  { slug: 'manufacturing', label: 'Manufacturing', icon: '🔧' },
];
const INDUSTRY_SLUGS = INDUSTRIES.map((i) => i.slug);

const REGULATIONS = [
  { code: 'WTO', text: 'World Trade Organization guidelines apply to all cross-border commerce. Parties must comply with non-discrimination, transparency, and reciprocity principles.' },
  { code: 'CISG', text: 'The UN Convention on Contracts for the International Sale of Goods governs international procurement contracts. Formation, performance, and breach remedies are standardised.' },
  { code: 'GDPR', text: 'The EU General Data Protection Regulation applies to all users whose data is processed. The rights of access, erasure, and portability are guaranteed.' },
  { code: 'eIDAS', text: 'Electronic signatures on this platform are recognised under the EU eIDAS Regulation and equivalent national laws, including the ESIGN Act (USA).' },
  { code: 'ICC', text: 'Incoterms 2020 apply to international shipping and delivery terms. Parties must specify the applicable Incoterm in each contract.' },
  { code: 'LOCAL', text: 'Local regulations of both buyer and seller jurisdictions apply. The platform uses the country and region on each profile to indicate which local law may apply.' },
];

const POLICIES = [
  { title: 'Cultural & Language Rights', text: 'You have the right to conduct business in your preferred language. Cultural differences in business practice are acknowledged and respected, and religious observance schedules may be accommodated on request.' },
  { title: 'Address Privacy Policy', text: 'Your country, region, and city are shown on your profile so counterparties know which jurisdiction applies. Your street address stays private unless you choose to publish it in your profile settings (recommended only for registered business premises).' },
];

// `answer` is the index of the correct option and is never sent to clients.
const QUIZ = [
  { q: 'Which regulation governs the validity of your digital signature on this platform?', options: ['WTO non-discrimination principle', 'eIDAS Regulation / ESIGN Act', 'ICC Incoterms 2020'], answer: 1 },
  { q: 'Is your street address visible to other users?', options: ['Always — it is mandatory', 'Only if I choose to publish it in my profile settings', 'Only to verified businesses'], answer: 1 },
  { q: 'What does the CISG govern on this platform?', options: ['International procurement contracts between buyers and sellers', 'Social media content moderation', 'Gig worker visa requirements'], answer: 0 },
  { q: 'What do Incoterms 2020 define?', options: ['Tax rates for each country', 'Shipping and delivery responsibilities', 'Minimum wages for gig work'], answer: 1 },
  { q: 'Which rights does GDPR guarantee?', options: ['Access, erasure, and portability of your data', 'Free international shipping', 'Guaranteed contract approval'], answer: 0 },
];
const PASS_RATIO = 0.8;

module.exports = { INDUSTRIES, INDUSTRY_SLUGS, REGULATIONS, POLICIES, QUIZ, PASS_RATIO };
