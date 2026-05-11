// ============================================================
// API /api/create-checkout-session
// Crée une session Stripe Checkout pour un abonnement
// ============================================================

// Importer Stripe
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // CORS - permettre l'app web à appeler ce serveur
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Pré-vol CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Seulement POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { plan, userId, userEmail } = req.body;

    if (!plan || !userId || !userEmail) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    // Choisir le bon Price ID selon le plan
    let priceId;
    if (plan === 'monthly') {
      priceId = process.env.STRIPE_PRICE_MONTHLY;
    } else if (plan === 'yearly') {
      priceId = process.env.STRIPE_PRICE_YEARLY;
    } else {
      return res.status(400).json({ error: 'Plan invalide' });
    }

    // URL de retour après paiement
    const origin = req.headers.origin || 'https://lepresidentsite.github.io';
    const successUrl = `${origin}/avant-la-paie/?paiement=success`;
    const cancelUrl = `${origin}/avant-la-paie/?paiement=annule`;

    // Créer la session Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        plan: plan
      },
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          user_id: userId
        }
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: 'fr-CA'
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch (error) {
    console.error('Erreur Stripe:', error);
    return res.status(500).json({ error: error.message });
  }
};
