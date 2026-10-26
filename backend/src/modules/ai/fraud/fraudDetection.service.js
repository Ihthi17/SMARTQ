import { Appointment } from '../../appointments/appointment.model.js';
import { User } from '../../users/user.model.js';
import { FraudFlag } from './fraudFlag.model.js';

/**
 * Check for duplicate bookings
 */
const checkDuplicateBookings = async (appointment) => {
  try {
    let score = 0;
    const reasons = [];

    if (!appointment.userId) {
      return { score: 0, reasons };
    }

    // Check for multiple appointments within short time window
    const recentAppointments = await Appointment.find({
      userId: appointment.userId,
      _id: { $ne: appointment._id },
      createdAt: {
        $gte: new Date(appointment.createdAt.getTime() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    }).lean();

    if (recentAppointments.length > 2) {
      score += 30;
      reasons.push(`Multiple bookings in 24 hours (${recentAppointments.length + 1} total)`);
    }

    // Check for same email/phone with different names
    const emailMatches = await Appointment.find({
      customerEmail: appointment.customerEmail,
      customerName: { $ne: appointment.customerName },
      _id: { $ne: appointment._id },
    }).lean();

    if (emailMatches.length > 0) {
      score += 20;
      reasons.push('Email used with different customer names');
    }

    return { score, reasons };
  } catch (error) {
    console.error('[fraudDetection] Duplicate check error:', error);
    return { score: 0, reasons: ['Error in duplicate check'] };
  }
};

/**
 * Check for no-show abuse patterns
 */
const checkNoShowAbuse = async (appointment) => {
  try {
    let score = 0;
    const reasons = [];

    if (!appointment.userId) {
      return { score: 0, reasons };
    }

    const userAppointments = await Appointment.find({
      userId: appointment.userId,
      _id: { $ne: appointment._id },
    }).lean();

    if (userAppointments.length > 0) {
      const noShowCount = userAppointments.filter(a => a.status === 'no_show').length;
      const cancelledCount = userAppointments.filter(a => a.status === 'cancelled').length;
      const completedCount = userAppointments.filter(a => a.status === 'completed').length;

      const noShowRate = completedCount > 0 ? noShowCount / (completedCount + noShowCount) : 0;
      const cancelRate = userAppointments.length > 0 ? cancelledCount / userAppointments.length : 0;

      if (noShowRate > 0.6) {
        score += 35;
        reasons.push(`High no-show rate: ${(noShowRate * 100).toFixed(1)}%`);
      } else if (noShowRate > 0.3) {
        score += 20;
        reasons.push(`Moderate no-show rate: ${(noShowRate * 100).toFixed(1)}%`);
      }

      if (cancelRate > 0.8) {
        score += 30;
        reasons.push(`Very high cancellation rate: ${(cancelRate * 100).toFixed(1)}%`);
      } else if (cancelRate > 0.5) {
        score += 15;
        reasons.push(`High cancellation rate: ${(cancelRate * 100).toFixed(1)}%`);
      }
    }

    return { score, reasons };
  } catch (error) {
    console.error('[fraudDetection] No-show check error:', error);
    return { score: 0, reasons: ['Error in no-show check'] };
  }
};

/**
 * Check for rapid rebooking patterns
 */
const checkRapidRebooking = async (appointment) => {
  try {
    let score = 0;
    const reasons = [];

    if (!appointment.userId) {
      return { score: 0, reasons };
    }

    // Check for bookings made immediately after cancellations
    const recentAppts = await Appointment.find({
      userId: appointment.userId,
      _id: { $ne: appointment._id },
      createdAt: {
        $gte: new Date(appointment.createdAt.getTime() - 60 * 60 * 1000), // Last hour
      },
    }).lean();

    const cancelledInLastHour = recentAppts.filter(a => a.status === 'cancelled').length;

    if (cancelledInLastHour > 1) {
      score += 25;
      reasons.push(`Rapid rebooking: ${cancelledInLastHour} cancellations in last hour`);
    } else if (cancelledInLastHour === 1) {
      score += 10;
      reasons.push('Rebooking immediately after cancellation');
    }

    return { score, reasons };
  } catch (error) {
    console.error('[fraudDetection] Rapid rebooking check error:', error);
    return { score: 0, reasons: ['Error in rebooking check'] };
  }
};

/**
 * Check for unverified contact information
 */
const checkContactVerification = async (appointment) => {
  try {
    let score = 0;
    const reasons = [];

    // Check if user is verified (if booking is by user, not admin)
    if (appointment.createdVia === 'online' && appointment.userId) {
      const user = await User.findById(appointment.userId).lean();

      if (!user) {
        score += 10;
        reasons.push('User account not found');
      } else if (user.status !== 'ACTIVE') {
        score += 15;
        reasons.push(`User account status: ${user.status}`);
      }

      // Check if email/phone is verified
      if (!user?.isEmailVerified) {
        score += 10;
        reasons.push('Email not verified');
      }
    }

    return { score, reasons };
  } catch (error) {
    console.error('[fraudDetection] Contact verification check error:', error);
    return { score: 0, reasons: ['Error in contact verification'] };
  }
};

/**
 * Calculate overall fraud score
 */
export const calculateFraudScore = async (appointment) => {
  try {
    const checks = await Promise.all([
      checkDuplicateBookings(appointment),
      checkNoShowAbuse(appointment),
      checkRapidRebooking(appointment),
      checkContactVerification(appointment),
    ]);

    let totalScore = 0;
    const allReasons = [];

    for (const check of checks) {
      totalScore += check.score;
      allReasons.push(...check.reasons);
    }

    // Cap score at 100
    totalScore = Math.min(totalScore, 100);

    return {
      fraudScore: totalScore,
      riskLevel: totalScore > 70 ? 'high' : totalScore > 40 ? 'medium' : 'low',
      requiresVerification: totalScore > 60,
      riskFactors: allReasons,
    };
  } catch (error) {
    console.error('[fraudDetection] Fraud score calculation error:', error);
    return {
      fraudScore: 0,
      riskLevel: 'low',
      requiresVerification: false,
      riskFactors: ['Error calculating fraud score'],
      error: error.message,
    };
  }
};

/**
 * Flag suspicious appointment
 */
export const flagSuspiciousAppointment = async (appointment, fraudAnalysis, userId) => {
  try {
    if (fraudAnalysis.fraudScore < 40) {
      return { flagged: false, reason: 'Score below threshold' };
    }

    const flag = new FraudFlag({
      appointmentId: appointment._id,
      userId: appointment.userId,
      fraudScore: fraudAnalysis.fraudScore,
      riskFactors: fraudAnalysis.riskFactors,
      flagReason: fraudAnalysis.riskFactors.join('; '),
      requiresVerification: fraudAnalysis.requiresVerification,
      status: fraudAnalysis.requiresVerification ? 'pending_verification' : 'flagged',
    });

    await flag.save();

    console.log(`[fraudDetection] Appointment ${appointment._id} flagged with score ${fraudAnalysis.fraudScore}`);

    return {
      flagged: true,
      flagId: flag._id,
      score: fraudAnalysis.fraudScore,
      requiresVerification: fraudAnalysis.requiresVerification,
    };
  } catch (error) {
    console.error('[fraudDetection] Error flagging appointment:', error);
    throw error;
  }
};

/**
 * Update fraud flag status
 */
export const updateFraudFlagStatus = async (flagId, status, verifiedBy, notes = '') => {
  try {
    const validStatuses = ['flagged', 'pending_verification', 'verified', 'rejected', 'dismissed'];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const updated = await FraudFlag.findByIdAndUpdate(
      flagId,
      {
        status,
        verifiedBy: status !== 'pending_verification' ? verifiedBy : undefined,
        verifiedAt: status !== 'pending_verification' ? new Date() : undefined,
        notes,
      },
      { new: true }
    );

    return updated;
  } catch (error) {
    console.error('[fraudDetection] Error updating fraud flag:', error);
    throw error;
  }
};

/**
 * Get fraud statistics
 */
export const getFraudStatistics = async (options = {}) => {
  try {
    const { daysBack = 30 } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const flags = await FraudFlag.find({
      createdAt: { $gte: cutoffDate },
    }).lean();

    const stats = {
      totalFlags: flags.length,
      byStatus: {},
      byRiskLevel: {
        high: 0,
        medium: 0,
        low: 0,
      },
      avgFraudScore: 0,
    };

    let totalScore = 0;

    for (const flag of flags) {
      stats.byStatus[flag.status] = (stats.byStatus[flag.status] || 0) + 1;

      const riskLevel = flag.fraudScore > 70 ? 'high' : flag.fraudScore > 40 ? 'medium' : 'low';
      stats.byRiskLevel[riskLevel]++;

      totalScore += flag.fraudScore;
    }

    stats.avgFraudScore = flags.length > 0 ? (totalScore / flags.length).toFixed(2) : 0;

    return stats;
  } catch (error) {
    console.error('[fraudDetection] Error getting statistics:', error);
    throw error;
  }
};
