'use strict';

const bcrypt = require('bcryptjs');

/** Demo data mirroring the original BizConnect mockup. All demo accounts use password "demo-password". */
exports.seed = async function seed(knex) {
  for (const t of ['messages', 'agreements', 'gig_applications', 'gigs', 'comments', 'post_likes', 'posts', 'users']) {
    await knex(t).del();
  }
  const hash = bcrypt.hashSync('demo-password', 10);
  const now = Date.now();
  const at = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();

  const users = [
    { email: 'jane@demo.bizconnect', name: 'Jane Doe', account_type: 'business', business_name: 'Doe Consulting', industry: 'technology', country: 'United States', region: 'New York', city: 'New York City', verified: true },
    { email: 'techmakers@demo.bizconnect', name: 'Tom Miller', account_type: 'business', business_name: 'TechMakers Ltd.', industry: 'technology', country: 'United States', region: 'New York', city: 'New York City', street_address: '42 Broadway, New York, NY 10004', address_public: true, verified: true, bio: 'Software development and IT consulting.' },
    { email: 'sarah@demo.bizconnect', name: 'Sarah Mendes', account_type: 'business', business_name: "Sarah's Market", industry: 'food', country: 'United States', region: 'New York', city: 'Brooklyn', street_address: '88 Atlantic Ave, Brooklyn NY 11201', address_public: true, verified: true, bio: 'Food & beverage retail, import/export.' },
    { email: 'raj@demo.bizconnect', name: 'Raj Kumar', account_type: 'individual', industry: 'technology', country: 'India', region: 'Maharashtra', city: 'Mumbai', verified: false, bio: 'IT consulting, remote & international.' },
    { email: 'amara@demo.bizconnect', name: 'Amara Lawson', account_type: 'business', business_name: 'Amara Lawson Designs', industry: 'fashion', country: 'Nigeria', region: 'Lagos State', city: 'Lagos', verified: true },
    { email: 'claire@demo.bizconnect', name: 'Claire Dubois', account_type: 'business', business_name: 'Dubois Traductions', industry: 'legal', country: 'France', region: 'Île-de-France', city: 'Paris', verified: true },
    { email: 'wei@demo.bizconnect', name: 'Wei Lin', account_type: 'business', business_name: 'Lion City Logistics', industry: 'logistics', country: 'Singapore', region: 'Central', city: 'Singapore', verified: true },
    { email: 'njeri@demo.bizconnect', name: 'Njeri Kamau', account_type: 'business', business_name: 'Rift Valley Exports', industry: 'agriculture', country: 'Kenya', region: 'Nairobi', city: 'Nairobi', verified: false },
  ];
  const ids = {};
  for (const [i, u] of users.entries()) {
    const row = { password_hash: hash, language: 'en', address_public: false, created_at: at(60 * 24 * (30 - i)), ...u };
    const [res] = await knex('users').insert(row).returning('id');
    ids[u.email.split('@')[0]] = typeof res === 'object' ? res.id : res;
  }

  const posts = [
    { author: 'amara', type: 'update', body: 'Excited to announce my first international procurement contract signed through BizConnect — verified across three jurisdictions. Cross-border compliance has never been this smooth. This platform is changing how small businesses go global. 🌍', country: 'Nigeria', city: 'Lagos', likes: 128, ago: 300 },
    { author: 'raj', type: 'update', body: 'Hiring: Senior React Developer — 3-month remote contract building a fintech platform. 5+ years of experience required. See the Gigs tab to apply!', country: 'India', city: 'Mumbai', likes: 19, ago: 200 },
    { author: 'sarah', type: 'bargain', body: 'Premium organic olive oil — imported directly from Mediterranean suppliers. Price set by international commodity benchmarking. Contracts available for bulk orders (min. 100 units).', price_cents: 2499, currency: 'USD', country: 'United States', city: 'Brooklyn', likes: 47, ago: 120 },
    { author: 'techmakers', type: 'update', body: 'TechMakers Ltd. is expanding! We have 8 open positions across software development and IT consulting. Partners welcome for cross-border projects.', country: 'United States', city: 'New York City', likes: 33, ago: 60 },
    { author: 'njeri', type: 'bargain', body: 'Fresh Kenyan AA coffee beans, direct from cooperative farms. FOB Mombasa, Incoterms 2020. Volume pricing for 1+ tonne.', price_cents: 850, currency: 'USD', country: 'Kenya', city: 'Nairobi', likes: 21, ago: 30 },
  ];
  for (const p of posts) {
    await knex('posts').insert({
      author_id: ids[p.author], type: p.type, body: p.body, price_cents: p.price_cents ?? null, currency: p.currency ?? null,
      country: p.country, city: p.city, like_count: p.likes, comment_count: 0, created_at: at(p.ago),
    });
  }

  const gigs = [
    { author: 'raj', title: 'Senior React Developer — Fintech', description: '3-month remote contract building a fintech platform. Must have 5+ years of React experience.', budget: '$8,000–$12,000 / month', industry: 'technology', remote: true, max: 50, count: 23 },
    { author: 'techmakers', title: 'UI/UX Designer — SaaS Product', description: 'Design end-to-end flows for our B2B SaaS dashboard. Portfolio required.', budget: '$3,000–$5,000 / project', industry: 'creative', remote: true, max: 30, count: 14 },
    { author: 'claire', title: 'French Translator — Legal Docs', description: 'Translate commercial contracts EN→FR with legal terminology accuracy.', budget: '$50 / hour', industry: 'legal', remote: false, country: 'France', city: 'Paris', max: 15, count: 6 },
    { author: 'wei', title: 'Supply Chain Manager', description: 'Lead APAC supply chain operations for a growing logistics firm.', budget: '$90,000 / year', industry: 'logistics', remote: false, country: 'Singapore', city: 'Singapore', max: 50, count: 42 },
    { author: 'sarah', title: 'Social Media Content Writer', description: 'Write engaging posts about imported specialty foods, 12 posts per month.', budget: '$800 / month', industry: 'food', remote: true, max: 20, count: 8 },
    { author: 'njeri', title: 'Agricultural Export Specialist', description: 'Manage export documentation and buyer relationships for coffee and tea.', budget: '$4,500 / month', industry: 'agriculture', remote: false, country: 'Kenya', city: 'Nairobi', max: 10, count: 3 },
  ];
  for (const [i, g] of gigs.entries()) {
    await knex('gigs').insert({
      author_id: ids[g.author], title: g.title, description: g.description, budget: g.budget, industry: g.industry,
      remote: g.remote, country: g.country ?? null, city: g.city ?? null, max_applications: g.max,
      application_count: g.count, status: 'open', created_at: at(500 - i * 60),
    });
  }

  await knex('messages').insert([
    { sender_id: ids.techmakers, recipient_id: ids.jane, body: 'Hi Jane — interested in partnering on a consulting project next quarter?', created_at: at(90) },
    { sender_id: ids.jane, recipient_id: ids.techmakers, body: 'Absolutely, let’s set up a call this week.', created_at: at(80), read_at: at(70) },
  ]);
};
