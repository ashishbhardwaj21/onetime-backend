/**
 * Subscription and Monetization Routes
 * Handles subscription management, payments, and premium features
 */

const express = require('express');
const router = express.Router();
const SubscriptionService = require('../services/SubscriptionService');
const User = require('../models/User');

// Initialize subscription service
const subscriptionService = new SubscriptionService();

/**
 * Get subscription tiers and pricing
 * GET /api/subscription/tiers
 */
router.get('/tiers', async (req, res) => {
  try {
    const tiers = subscriptionService.getSubscriptionTiers();
    
    res.status(200).json({
      success: true,
      message: 'Subscription tiers retrieved',
      data: tiers
    });

  } catch (error) {
    console.error('Get subscription tiers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription tiers'
    });
  }
});

/**
 * Get current user's subscription status
 * GET /api/subscription/status
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.user._id;
    const analytics = await subscriptionService.getUserSubscriptionAnalytics(userId);
    
    res.status(200).json({
      success: true,
      message: 'Subscription status retrieved',
      data: analytics
    });

  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status'
    });
  }
});

/**
 * Create new subscription
 * POST /api/subscription/create
 */
router.post('/create', async (req, res) => {
  try {
    const userId = req.user._id;
    const { tierId, paymentMethodId, promotionCode } = req.body;

    if (!tierId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Subscription tier and payment method are required'
      });
    }

    const result = await subscriptionService.createSubscription(userId, {
      tierId,
      paymentMethodId,
      promotionCode
    });

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: result
    });

  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create subscription'
    });
  }
});

/**
 * Cancel subscription
 * POST /api/subscription/cancel
 */
router.post('/cancel', async (req, res) => {
  try {
    const userId = req.user._id;
    const { immediate = false, reason } = req.body;

    const result = await subscriptionService.cancelSubscription(userId, immediate);
    
    // Log cancellation reason for analytics
    if (reason) {
      const user = await User.findById(userId);
      if (!user.analytics) user.analytics = {};
      if (!user.analytics.cancellationReasons) user.analytics.cancellationReasons = [];
      
      user.analytics.cancellationReasons.push({
        reason,
        timestamp: new Date(),
        tier: user.subscription?.tier
      });
      
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Subscription canceled successfully',
      data: result
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to cancel subscription'
    });
  }
});

/**
 * Purchase add-on (boost, super likes, etc.)
 * POST /api/subscription/addon/purchase
 */
router.post('/addon/purchase', async (req, res) => {
  try {
    const userId = req.user._id;
    const { addOnId, paymentMethodId, quantity = 1 } = req.body;

    if (!addOnId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Add-on ID and payment method are required'
      });
    }

    const result = await subscriptionService.purchaseAddOn(userId, {
      addOnId,
      paymentMethodId,
      quantity
    });

    res.status(201).json({
      success: true,
      message: 'Add-on purchased successfully',
      data: result
    });

  } catch (error) {
    console.error('Purchase add-on error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to purchase add-on'
    });
  }
});

/**
 * Check feature access
 * GET /api/subscription/feature/:featureName/access
 */
router.get('/feature/:featureName/access', async (req, res) => {
  try {
    const { featureName } = req.params;
    const user = req.user;

    const hasAccess = subscriptionService.hasFeatureAccess(user, featureName);

    res.status(200).json({
      success: true,
      message: 'Feature access checked',
      data: {
        featureName,
        hasAccess,
        tier: user.subscription?.tier || 'free',
        upgradeRequired: !hasAccess
      }
    });

  } catch (error) {
    console.error('Check feature access error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check feature access'
    });
  }
});

/**
 * Check usage limits
 * GET /api/subscription/limits/:limitType/check
 */
router.get('/limits/:limitType/check', async (req, res) => {
  try {
    const { limitType } = req.params;
    const { currentUsage } = req.query;
    const user = req.user;

    const withinLimits = subscriptionService.isWithinLimits(
      user,
      limitType,
      parseInt(currentUsage) || 0
    );

    res.status(200).json({
      success: true,
      message: 'Usage limits checked',
      data: {
        limitType,
        currentUsage: parseInt(currentUsage) || 0,
        withinLimits,
        tier: user.subscription?.tier || 'free'
      }
    });

  } catch (error) {
    console.error('Check usage limits error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check usage limits'
    });
  }
});

/**
 * Validate promotion code
 * POST /api/subscription/promotion/validate
 */
router.post('/promotion/validate', async (req, res) => {
  try {
    const userId = req.user._id;
    const { promotionCode } = req.body;

    if (!promotionCode) {
      return res.status(400).json({
        success: false,
        error: 'Promotion code is required'
      });
    }

    try {
      const couponId = await subscriptionService.validateAndApplyPromotion(userId, promotionCode);
      
      res.status(200).json({
        success: true,
        message: 'Promotion code validated',
        data: {
          valid: true,
          couponId,
          promotionCode
        }
      });

    } catch (validationError) {
      res.status(400).json({
        success: false,
        error: validationError.message,
        data: {
          valid: false,
          promotionCode
        }
      });
    }

  } catch (error) {
    console.error('Validate promotion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate promotion code'
    });
  }
});

/**
 * Get billing history
 * GET /api/subscription/billing/history
 */
router.get('/billing/history', async (req, res) => {
  try {
    const user = req.user;
    const { limit = 10, offset = 0 } = req.query;

    const billingHistory = user.billing?.purchaseHistory || [];
    const paginatedHistory = billingHistory
      .sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Billing history retrieved',
      data: {
        history: paginatedHistory,
        total: billingHistory.length,
        currentSubscription: {
          tier: user.subscription?.tier || 'free',
          status: user.subscription?.status || 'free',
          nextBillingDate: user.billing?.nextBillingDate
        }
      }
    });

  } catch (error) {
    console.error('Get billing history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get billing history'
    });
  }
});

/**
 * Update payment method
 * PUT /api/subscription/payment-method
 */
router.put('/payment-method', async (req, res) => {
  try {
    const userId = req.user._id;
    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Payment method ID is required'
      });
    }

    const user = await User.findById(userId);
    if (!user.billing?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'No Stripe customer found'
      });
    }

    // Attach new payment method to customer
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.billing.stripeCustomerId,
    });

    // Set as default payment method
    await stripe.customers.update(user.billing.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Update user record
    user.billing.paymentMethodId = paymentMethodId;
    user.billing.paymentMethodUpdatedAt = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Payment method updated successfully',
      data: {
        paymentMethodId,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Update payment method error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update payment method'
    });
  }
});

/**
 * Pause subscription
 * POST /api/subscription/pause
 */
router.post('/pause', async (req, res) => {
  try {
    const userId = req.user._id;
    const { pauseDuration = 30 } = req.body; // days

    const user = await User.findById(userId);
    if (!user.subscription?.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    // Pause subscription using Stripe's pause collection
    await stripe.subscriptions.update(user.subscription.stripeSubscriptionId, {
      pause_collection: {
        behavior: 'keep_as_draft',
        resumes_at: Math.floor((Date.now() + pauseDuration * 24 * 60 * 60 * 1000) / 1000)
      }
    });

    // Update user record
    user.subscription.status = 'paused';
    user.subscription.pausedAt = new Date();
    user.subscription.resumesAt = new Date(Date.now() + pauseDuration * 24 * 60 * 60 * 1000);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Subscription paused successfully',
      data: {
        pausedAt: user.subscription.pausedAt,
        resumesAt: user.subscription.resumesAt,
        pauseDuration
      }
    });

  } catch (error) {
    console.error('Pause subscription error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to pause subscription'
    });
  }
});

/**
 * Resume subscription
 * POST /api/subscription/resume
 */
router.post('/resume', async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user.subscription?.stripeSubscriptionId || user.subscription?.status !== 'paused') {
      return res.status(400).json({
        success: false,
        error: 'No paused subscription found'
      });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    // Resume subscription
    await stripe.subscriptions.update(user.subscription.stripeSubscriptionId, {
      pause_collection: null
    });

    // Update user record
    user.subscription.status = 'active';
    user.subscription.resumedAt = new Date();
    user.subscription.pausedAt = undefined;
    user.subscription.resumesAt = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Subscription resumed successfully',
      data: {
        resumedAt: user.subscription.resumedAt,
        status: 'active'
      }
    });

  } catch (error) {
    console.error('Resume subscription error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to resume subscription'
    });
  }
});

module.exports = router;