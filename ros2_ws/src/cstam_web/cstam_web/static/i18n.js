/* Client page translations (French default, English). Usage: I18n.t('key', {n: 2}). */
const I18n = (() => {
  const STRINGS = {
    fr: {
      demo_banner: 'Mode démo : robot simulé (ROS 2 non connecté)',
      order_from_table: 'Commandez depuis votre table',
      your_table: 'Votre table',
      change: 'Changer',
      choose_table: 'Choisissez votre table',
      choose_order: 'Votre commande',
      note_label: 'Note pour la cuisine (facultatif)',
      note_ph: 'ex. sans oignons, plus de sucre',
      no_items: 'Aucun article',
      items: n => `${n} article${n > 1 ? 's' : ''}`,
      hint_table: 'Choisissez votre table',
      hint_item: 'Ajoutez au moins un article',
      hint_ahead: n => `${n} commande(s) avant la vôtre`,
      hint_deliver: t => `Livré à la ${t}`,
      order: 'Commander',
      order_to: t => `Commander · ${t}`,
      sending: 'Envoi…',
      add_one: n => `Ajouter un ${n}`,
      remove_one: n => `Retirer un ${n}`,
      // availability
      av_ready: 'Robot disponible',
      av_busy: n => `Occupé · ${n} avant`,
      av_charging: 'En recharge',
      av_offline: 'Robot hors ligne',
      av_reconnecting: 'Reconnexion…',
      av_offline_msg: 'Le robot est hors ligne. Merci de demander au personnel.',
      av_charging_msg: p => `Le robot se recharge (${p}%). Votre commande partira dès qu'il sera prêt.`,
      // tracking
      step_received: 'Commande reçue',
      step_queued: 'En attente du robot',
      step_en_route: 'En route',
      step_arrived: 'À votre table',
      st_submitted: ['Commande reçue', 'Envoi de votre commande au robot…'],
      st_queued: ['Dans la file', ''],
      st_en_route: ['En route !', 'Le robot arrive à votre table.'],
      st_arrived: ['Votre commande est là', 'Servez-vous sur le plateau du robot.'],
      st_delivered: ['Livrée', 'Bon appétit !'],
      st_cancelled: ['Commande annulée', 'Votre commande a été annulée.'],
      st_failed: ['Problème de livraison', "Le robot n'a pas pu atteindre votre table. Un serveur va vous apporter votre commande."],
      st_rejected: ['Commande non acceptée', "Le robot n'a pas accepté la commande. Merci de demander au personnel."],
      queue_ahead: n => `${n} commande(s) avant la vôtre.`,
      queue_next: 'Vous êtes le prochain !',
      queue_charging: ' Le robot se recharge d\'abord.',
      eta: s => s >= 60 ? `Arrivée dans ≈ ${Math.round(s / 60)} min` : `Arrivée dans ≈ ${s} s`,
      cancel_order: 'Annuler la commande',
      cancel_confirm: 'Annuler cette commande ?',
      new_order: 'Nouvelle commande',
      // voice
      voice_btn: 'Commande vocale',
      categories: 'Catégories du menu',
      review_title: 'Vérifiez votre commande',
      review_back: 'Modifier',
      review_confirm: n => `Confirmer · ${n} article${n > 1 ? 's' : ''}`,
      review_ready: 'Le robot part dès que vous confirmez.',
      voice_lang: 'Je parle en :',
      voice_listening: 'Je vous écoute… parlez normalement, puis faites une pause (ou touchez 🎤 pour terminer).',
      voice_idle: 'Appuyez sur 🎤 pour parler, ou écrivez votre commande.',
      voice_unsupported: "La reconnaissance vocale n'est pas disponible sur ce navigateur (utilisez Chrome ou Edge). Vous pouvez écrire votre commande.",
      voice_denied: "Micro refusé. Autorisez le micro dans le navigateur, ou écrivez votre commande.",
      voice_nothing: "Je n'ai rien entendu. Réessayez.",
      voice_nomic: 'Aucun micro détecté. Branchez un micro, ou écrivez votre commande.',
      voice_network: "Service de reconnaissance vocale injoignable (il faut Internet et Google Chrome ou Edge ; Chromium/Firefox ne l'ont pas). Écrivez votre commande.",
      voice_heard: t => `« ${t} »`,
      voice_ph: 'ex. deux thés à la menthe et un brik, table 4',
      voice_go: 'OK',
      voice_tip: 'Astuce : choisissez la langue que vous parlez, puis dites les plats, les quantités et le numéro de table. La derja passe en mode Français (« zouz kahwa, tawla 3 »).',
      voice_added: 'Ajouté à votre commande :',
      voice_table: t => `Table : ${t}`,
      voice_unknown: w => `Pas compris : ${w}`,
      voice_none: "Je n'ai reconnu aucun plat du menu. Réessayez avec le nom du plat.",
      voice_check: 'Vérifiez puis appuyez sur « Commander ».',
      voice_say_ok: (items, table) => `C'est noté : ${items}${table ? `, pour la ${table}` : ''}. Appuyez sur commander pour confirmer.`,
      speech_lang: 'fr-FR',
      cat: { Drinks: 'Boissons', Dishes: 'Plats', Desserts: 'Desserts' },
    },
    en: {
      demo_banner: 'Demo mode: simulated robot (ROS 2 not connected)',
      order_from_table: 'Order from your table',
      your_table: 'Your table',
      change: 'Change',
      choose_table: 'Choose your table',
      choose_order: 'Choose your order',
      note_label: 'Note for the kitchen (optional)',
      note_ph: 'e.g. no onions, extra sugar',
      no_items: 'No items yet',
      items: n => `${n} item${n > 1 ? 's' : ''}`,
      hint_table: 'Choose your table',
      hint_item: 'Add at least one item',
      hint_ahead: n => `${n} order(s) before yours`,
      hint_deliver: t => `Delivered to ${t}`,
      order: 'Order',
      order_to: t => `Order · ${t}`,
      sending: 'Sending…',
      add_one: n => `Add one ${n}`,
      remove_one: n => `Remove one ${n}`,
      av_ready: 'Robot available',
      av_busy: n => `Busy · ${n} ahead`,
      av_charging: 'Recharging',
      av_offline: 'Robot offline',
      av_reconnecting: 'Reconnecting…',
      av_offline_msg: 'The robot is offline. Please ask the staff.',
      av_charging_msg: p => `The robot is recharging (${p}%). Your order will leave as soon as it is ready.`,
      step_received: 'Order received',
      step_queued: 'Waiting for the robot',
      step_en_route: 'On the way',
      step_arrived: 'At your table',
      st_submitted: ['Order received', 'Sending your order to the robot…'],
      st_queued: ['In the queue', ''],
      st_en_route: ['On the way!', 'The robot is coming to your table.'],
      st_arrived: ['Your order is here', 'Please take your order from the robot tray.'],
      st_delivered: ['Delivered', 'Enjoy your meal!'],
      st_cancelled: ['Order cancelled', 'Your order was cancelled.'],
      st_failed: ['Delivery problem', 'The robot could not reach your table. A waiter will bring your order.'],
      st_rejected: ['Order not accepted', 'The robot did not accept the order. Please ask the staff.'],
      queue_ahead: n => `${n} order(s) before yours.`,
      queue_next: 'You are next!',
      queue_charging: ' The robot is recharging first.',
      eta: s => s >= 60 ? `Arriving in ≈ ${Math.round(s / 60)} min` : `Arriving in ≈ ${s} s`,
      cancel_order: 'Cancel order',
      cancel_confirm: 'Cancel this order?',
      new_order: 'New order',
      voice_btn: 'Voice order',
      categories: 'Menu categories',
      review_title: 'Check your order',
      review_back: 'Edit',
      review_confirm: n => `Confirm · ${n} item${n > 1 ? 's' : ''}`,
      review_ready: 'The robot leaves as soon as you confirm.',
      voice_lang: 'I speak:',
      voice_listening: 'Listening… speak normally, then pause (or tap 🎤 to finish).',
      voice_idle: 'Tap 🎤 to speak, or type your order.',
      voice_unsupported: 'Speech recognition is not available in this browser (use Chrome or Edge). You can type your order.',
      voice_denied: 'Microphone blocked. Allow the microphone in the browser, or type your order.',
      voice_nothing: 'I did not hear anything. Please try again.',
      voice_nomic: 'No microphone found. Plug one in, or type your order.',
      voice_network: 'Speech service unreachable (needs Internet and Google Chrome or Edge; Chromium/Firefox lack it). Please type your order.',
      voice_heard: t => `"${t}"`,
      voice_ph: 'e.g. two mint teas and a brik, table 4',
      voice_go: 'OK',
      voice_tip: 'Tip: pick the language you speak, then say the dishes, the quantities and your table number. Tunisian derja works in Français mode ("zouz kahwa, tawla 3").',
      voice_added: 'Added to your order:',
      voice_table: t => `Table: ${t}`,
      voice_unknown: w => `Not understood: ${w}`,
      voice_none: 'I did not recognise any dish from the menu. Try again with the dish name.',
      voice_check: 'Check it, then tap "Order".',
      voice_say_ok: (items, table) => `Got it: ${items}${table ? `, for ${table}` : ''}. Tap order to confirm.`,
      speech_lang: 'en-US',
      cat: {},
    },
  };

  const KEY = 'tunibot_lang';
  let lang = localStorage.getItem(KEY) || ((navigator.language || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr');
  if (!STRINGS[lang]) lang = 'fr';

  function t(key, ...args) {
    const v = STRINGS[lang][key] ?? STRINGS.en[key];
    return typeof v === 'function' ? v(...args) : (v ?? key);
  }

  /** Fills every [data-i18n], [data-i18n-ph] and [data-i18n-aria] element. */
  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  }

  /** Translation in a given language, whatever the page language. */
  function tIn(l, key, ...args) {
    const v = (STRINGS[l] || STRINGS.fr)[key] ?? STRINGS.en[key];
    return typeof v === 'function' ? v(...args) : (v ?? key);
  }

  function set(l) { lang = STRINGS[l] ? l : 'fr'; localStorage.setItem(KEY, lang); apply(); }
  function get() { return lang; }
  /** Menu fields: name_fr / desc_fr when the page is in French. */
  function field(obj, name) { return (lang === 'fr' && obj[`${name}_fr`]) || obj[name] || ''; }

  return { t, tIn, apply, set, get, field };
})();
