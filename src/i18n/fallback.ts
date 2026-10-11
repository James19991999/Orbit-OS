// Strings for screens that render outside the i18n provider (offline page, global error). Tiny on purpose.
import { resolveLanguage, LANGUAGE_COOKIE, type Language } from './shared';

export const FALLBACK = {
  en: {
    offline: 'You’re offline', needs: 'This page needs a connection.',
    tip1: 'Check-ins you write while offline are saved on this device and sent automatically when you reconnect.',
    tip2: 'On WhatsApp you can still reply to a check-in reminder — it arrives when your phone has signal.',
    retry: 'Try again', error: 'OrbitOS hit an unexpected error', again: 'Please try again.', ref: 'Reference',
    nfCode: 'Error 404', nfTitle: 'This page drifted out of orbit', nfBody: 'It may have been moved or deleted, or you may not have access in this workspace.', nfDash: 'Go to dashboard', nfHome: 'Home',
    paidH: 'Thank you', paidB: 'Your payment is being confirmed by IntaSend. You’ll get a receipt by email, and the invoice updates automatically once M-Pesa or your card issuer confirms.', paidBack: 'Return to OrbitOS',
  },
  sw: {
    offline: 'Uko nje ya mtandao', needs: 'Ukurasa huu unahitaji muunganisho.',
    tip1: 'Mahudhurio unayoandika ukiwa nje ya mtandao huhifadhiwa kwenye kifaa hiki na kutumwa kiotomatiki ukiunganishwa tena.',
    tip2: 'Kwenye WhatsApp bado unaweza kujibu kikumbusho cha mahudhurio — kitafika simu yako ikipata mtandao.',
    retry: 'Jaribu tena', error: 'OrbitOS imekumbwa na hitilafu isiyotarajiwa', again: 'Tafadhali jaribu tena.', ref: 'Kumbukumbu',
    nfCode: 'Hitilafu 404', nfTitle: 'Ukurasa huu umepotea njia', nfBody: 'Huenda umehamishwa au kufutwa, au huna ruhusa kwenye eneo hili la kazi.', nfDash: 'Nenda kwenye dashibodi', nfHome: 'Mwanzo',
    paidH: 'Asante', paidB: 'Malipo yako yanathibitishwa na IntaSend. Utapata risiti kwa barua pepe, na ankara itasasishwa kiotomatiki M-Pesa au mtoaji wa kadi yako akithibitisha.', paidBack: 'Rudi OrbitOS',
  },
  fr: {
    offline: 'Vous êtes hors ligne', needs: 'Cette page nécessite une connexion.',
    tip1: 'Les points quotidiens rédigés hors ligne sont enregistrés sur cet appareil et envoyés automatiquement à la reconnexion.',
    tip2: 'Sur WhatsApp, vous pouvez toujours répondre à un rappel de point quotidien — il partira dès que votre téléphone aura du réseau.',
    retry: 'Réessayer', error: 'OrbitOS a rencontré une erreur inattendue', again: 'Veuillez réessayer.', ref: 'Référence',
    nfCode: 'Erreur 404', nfTitle: 'Cette page s’est perdue en orbite', nfBody: 'Elle a peut-être été déplacée ou supprimée, ou vous n’y avez pas accès dans cet espace.', nfDash: 'Aller au tableau de bord', nfHome: 'Accueil',
    paidH: 'Merci', paidB: 'Votre paiement est en cours de confirmation par IntaSend. Vous recevrez un reçu par e-mail, et la facture se mettra à jour automatiquement dès confirmation par M-Pesa ou l’émetteur de votre carte.', paidBack: 'Retour à OrbitOS',
  },
} as const;

/** Browser-only: the saved language cookie, else the browser language. */
export function browserLanguage(): Language {
  if (typeof document === 'undefined') return 'en';
  const c = document.cookie.split('; ').find((x) => x.startsWith(`${LANGUAGE_COOKIE}=`))?.split('=')[1];
  return resolveLanguage(c, navigator.languages?.join(',') ?? navigator.language);
}
