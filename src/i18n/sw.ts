import type { MessageKey } from './en';

/** Kiswahili. Machine-assisted draft — have a native speaker review before marketing it. */
export const sw: Partial<Record<MessageKey, string>> = {
  'wa.checkin.saved': 'Asante {name}! Ripoti yako ya leo kwa {org} imehifadhiwa. Hali {mood}/5.',
  'wa.checkin.which_org': 'Uko kwenye timu zaidi ya moja. Jibu ujumbe wa ukumbusho ili nijue ni ya timu ipi.',
  'wa.checkin.no_org': 'Wewe si mwanachama hai wa timu inayopokea ripoti za kila siku.',
  'wa.checkin.read_only': '{org} iko katika hali ya kusoma tu kwa sasa, kwa hivyo ripoti haikuhifadhiwa.',
  'wa.checkin.too_short': 'Niambie zaidi kidogo kuhusu ulichokamilisha (angalau maneno machache).',
  'wa.unknown_number': 'Nambari hii haijaunganishwa na akaunti ya OrbitOS. Iunganishe kwenye Wasifu → WhatsApp.',
  'wa.help': 'OrbitOS kwenye WhatsApp:\n• Jibu ukumbusho kwa ulichokamilisha leo. Anza na nambari 1–5 ya hali yako, na ongeza "Vikwazo:" kama kuna kinachokuzuia.\n• Bonyeza Idhinisha au Kataa kwenye maombi ya matumizi.\n• Tuma STOP kusitisha ujumbe, START kuendelea.',
  'wa.stopped': 'Sawa — hutapokea ukumbusho wala maombi ya idhini kwenye WhatsApp. Tuma START kuyarudisha.',
  'wa.started': 'Umerudi: ukumbusho na maombi ya idhini yatakuja hapa.',
  'wa.expense.approved': 'Imeidhinishwa: {what}. Timu inaweza kuiona kwenye Operesheni → Fedha.',
  'wa.expense.rejected': 'Imekataliwa: {what}.',
  'wa.expense.already_approved': 'Matumizi hayo tayari yameidhinishwa.',
  'wa.expense.already_rejected': 'Matumizi hayo tayari yamekataliwa.',
  'wa.expense.forbidden': 'Wamiliki na wakurugenzi wa timu pekee ndio wanaoweza kuamua kuhusu matumizi.',
  'wa.expense.own': 'Huwezi kuidhinisha matumizi yako mwenyewe — mmiliki au mkurugenzi mwingine lazima afanye hivyo.',
  'wa.expense.not_found': 'Matumizi hayo hayapo tena.',
  'wa.expense.read_only': 'Timu iko katika hali ya kusoma tu kwa sasa, kwa hivyo hakuna kilichobadilishwa.',
  'wa.unsupported': 'Ninaweza kusoma ujumbe wa maandishi na vitufe. Tuma HELP kuona ninachoweza kufanya.',
};
