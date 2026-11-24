// Serveur des comptes (Supabase, offre gratuite). Cette clé est publique par conception :
// la sécurité repose sur les règles d'accès (chacun ne lit que son coffre) et sur le chiffrement de bout en bout.
const TEST = location.host === '127.0.0.1:5181'; // serveur de test local (tools/mock-cloud.mjs)
export const CLOUD = TEST
  ? { url: location.origin + '/mock', key: 'test' }
  : { url: 'https://ualaypljpclvvuxgcgro.supabase.co', key: 'sb_publishable_wojmhkW4TUrhEyvsw9y4dg_b0zV7jvm' };
