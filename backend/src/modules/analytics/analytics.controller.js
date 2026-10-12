import { Appointment } from '../appointments/appointment.model.js';
import { Provider } from '../providers/provider.model.js';
import { Location } from '../locations/location.model.js';
import mongoose from 'mongoose';

const validateObjectId = (id) => mongoose.isValidObjectId(id);

/**
 * Calculate wait time in minutes from queueJoinedAt to calledAt
 */
const calculateWaitTime = (appointment) => {
  if (!appointment.queueJoinedAt || !appointment.calledAt) return null;
  const ms = new Date(appointment.calledAt) - new Date(appointment.queueJoinedAt);
  return Math.round(ms / (1000 * 60));
};

/**
 * Calculate service time in minutes from calledAt to completedAt
 */
const calculateServiceTime = (appointment) => {
  if (!appointment.calledAt) return null;
  const endTime = appointment.completedAt || (appointment.status === 'in_service' ? new Date() : null);
  if (!endTime) return null;
  const ms = new Date(endTime) - new Date(appointment.calledAt);
  return Math.round(ms / (1000 * 60));
};

/**
 * GET /api/analytics/queue
 * Get queue analytics with various metrics and trends
 * Query params:
 *   - range: 'today' | 'week' | 'month' | 'custom'
 *   - from: ISO date string (for custom range)
 *   - to: ISO date string (for custom range)
 *   - providerId: filter by provider
 */
export const getQueueAnalytics = async (req, res, next) => {
  try {
    const { range = 'today', from, to, providerId } = req.query;
    let dateFilter = {};

    // Calculate date range
    const now = new Date();
    if (range === 'today') {
      const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      dateFilter = { scheduledStart: { $gte: startOfDay, $lt: endOfDay } };
    } else if (range === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setUTCHours(0, 0, 0, 0);
      dateFilter = { scheduledStart: { $gte: startOfWeek } };
    } else if (range === 'month') {
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      dateFilter = { scheduledStart: { $gte: startOfMonth } };
    } else if (range === 'custom' && from && to) {
      dateFilter = { scheduledStart: { $gte: new Date(from), $lt: new Date(to) } };
    }

    // Add provider filter if specified, validate it's active
    const filter = { ...dateFilter };
    if (providerId && validateObjectId(providerId)) {
      const provider = await Provider.findOne({ _id: providerId, isActive: true });
      if (!provider) {
        return res.status(404).json({ message: 'Provider not found or inactive' });
      }
      filter.providerId = providerId;
    }

    // Get all appointments in the range (only active providers)
    const appointments = await Appointment.find(filter)
      .populate({
        path: 'providerId',
        match: { isActive: true },
        select: 'name'
      })
      .lean();

    // Filter out appointments from inactive providers
    const activeAppointments = appointments.filter(a => a.providerId);

    if (activeAppointments.length === 0) {
      return res.json({
        range,
        metrics: {
          totalAppointments: 0,
          totalServed: 0,
          byStatus: {
            pending: 0, confirmed: 0, queued: 0, called: 0,
            inService: 0, completed: 0, cancelled: 0, noShow: 0,
          },
          completionRate: 0,
          noShowRate: 0,
          cancellationRate: 0,
        },
        charts: {
          serviceDistribution: [],
          providerDistribution: [],
          dailyTrend: [],
          statusBreakdown: [],
          sourceBreakdown: [],
          priorityBreakdown: [],
        },
        summary: {
          totalAppointments: 0,
          completionRate: 0,
          noShowRate: 0,
          cancellationRate: 0,
          avgWaitTime: 0,
          avgServiceTime: 0,
        },
        waitTimeTrend: [],
        serviceDurationTrend: [],
        hourlyDistribution: [],
        servicePerformance: [],
        detailedStats: {
          peakHour: '—',
          noShowRate: 0,
          maxWaitTime: 0,
          maxServiceTime: 0,
        },
      });
    }

    // Calculate metrics
    const completed = activeAppointments.filter(a => a.status === 'completed');
    const waitTimes = completed
      .map(calculateWaitTime)
      .filter(t => t !== null);
    const serviceTimes = completed
      .map(calculateServiceTime)
      .filter(t => t !== null);

    const avgWaitTime = waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
    const avgServiceTime = serviceTimes.length > 0 ? Math.round(serviceTimes.reduce((a, b) => a + b, 0) / serviceTimes.length) : 0;
    const maxWaitTime = waitTimes.length > 0 ? Math.max(...waitTimes) : 0;
    const maxServiceTime = serviceTimes.length > 0 ? Math.max(...serviceTimes) : 0;

    const metrics = {
      totalAppointments: activeAppointments.length,
      totalServed: completed.length,
      byStatus: {
        pending: activeAppointments.filter(a => a.status === 'pending').length,
        confirmed: activeAppointments.filter(a => a.status === 'confirmed').length,
        queued: activeAppointments.filter(a => a.status === 'queued').length,
        called: activeAppointments.filter(a => a.status === 'called').length,
        inService: activeAppointments.filter(a => a.status === 'in_service').length,
        completed: completed.length,
        cancelled: activeAppointments.filter(a => a.status === 'cancelled').length,
        noShow: activeAppointments.filter(a => a.status === 'no_show').length,
      },
      completionRate: activeAppointments.length > 0
        ? Math.round((completed.length / activeAppointments.length) * 100)
        : 0,
      noShowRate: activeAppointments.length > 0
        ? Math.round((activeAppointments.filter(a => a.status === 'no_show').length / activeAppointments.length) * 100)
        : 0,
      cancellationRate: activeAppointments.length > 0
        ? Math.round((activeAppointments.filter(a => a.status === 'cancelled').length / activeAppointments.length) * 100)
        : 0,
    };

    // Group by service code
    const byService = {};
    activeAppointments.forEach(a => {
      if (!byService[a.serviceCode]) {
        byService[a.serviceCode] = { 
          service: a.serviceCode, 
          count: 0, 
          completed: 0, 
          noShow: 0,
          totalWaitTime: 0,
          totalServiceTime: 0,
          waitCount: 0,
          serviceCount: 0,
        };
      }
      byService[a.serviceCode].count++;
      if (a.status === 'completed') {
        byService[a.serviceCode].completed++;
        const wt = calculateWaitTime(a);
        if (wt !== null) {
          byService[a.serviceCode].totalWaitTime += wt;
          byService[a.serviceCode].waitCount++;
        }
        const st = calculateServiceTime(a);
        if (st !== null) {
          byService[a.serviceCode].totalServiceTime += st;
          byService[a.serviceCode].serviceCount++;
        }
      }
      if (a.status === 'no_show') byService[a.serviceCode].noShow++;
    });

    // Calculate averages for service performance
    const servicePerformance = Object.values(byService).map(s => ({
      service: s.service,
      count: s.count,
      completed: s.completed,
      avgWaitTime: s.waitCount > 0 ? Math.round(s.totalWaitTime / s.waitCount) : 0,
      avgServiceTime: s.serviceCount > 0 ? Math.round(s.totalServiceTime / s.serviceCount) : 0,
    }));

    // Group by provider
    const byProvider = {};
    activeAppointments.forEach(a => {
      const providerName = a.providerId?.name || 'Unknown';
      if (!byProvider[providerName]) {
        byProvider[providerName] = { provider: providerName, count: 0, completed: 0, noShow: 0 };
      }
      byProvider[providerName].count++;
      if (a.status === 'completed') byProvider[providerName].completed++;
      if (a.status === 'no_show') byProvider[providerName].noShow++;
    });

    // Group by day (for daily trend)
    const byDay = {};
    activeAppointments.forEach(a => {
      const day = new Date(a.scheduledStart).toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { 
          date: day, 
          total: 0, 
          completed: 0, 
          cancelled: 0, 
          noShow: 0,
          totalWaitTime: 0,
          waitCount: 0,
        };
      }
      byDay[day].total++;
      if (a.status === 'completed') {
        byDay[day].completed++;
        const wt = calculateWaitTime(a);
        if (wt !== null) {
          byDay[day].totalWaitTime += wt;
          byDay[day].waitCount++;
        }
      }
      if (a.status === 'cancelled') byDay[day].cancelled++;
      if (a.status === 'no_show') byDay[day].noShow++;
    });

    // Convert daily trend and calculate averages
    const dailyTrend = Object.values(byDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        avgWaitTime: d.waitCount > 0 ? Math.round(d.totalWaitTime / d.waitCount) : 0,
      }));

    // Hourly distribution
    const byHour = {};
    activeAppointments.forEach(a => {
      const hour = new Date(a.scheduledStart).getUTCHours();
      if (!byHour[hour]) {
        byHour[hour] = { hour: `${String(hour).padStart(2, '0')}:00`, count: 0, completed: 0 };
      }
      byHour[hour].count++;
      if (a.status === 'completed') byHour[hour].completed++;
    });

    const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      count: byHour[i]?.count || 0,
      completed: byHour[i]?.completed || 0,
    }));

    // Peak hour
    let peakHour = '—';
    let maxCount = 0;
    for (const [hour, data] of Object.entries(byHour)) {
      if (data.count > maxCount) {
        maxCount = data.count;
        peakHour = data.hour;
      }
    }

    // Wait time trend (by hour)
    const waitTimeTrendByHour = {};
    completed.forEach(a => {
      const hour = new Date(a.calledAt || a.scheduledStart).getUTCHours();
      const wt = calculateWaitTime(a);
      if (wt !== null) {
        if (!waitTimeTrendByHour[hour]) {
          waitTimeTrendByHour[hour] = { times: [] };
        }
        waitTimeTrendByHour[hour].times.push(wt);
      }
    });

    const waitTimeTrend = Array.from({ length: 24 }, (_, i) => ({
      time: `${String(i).padStart(2, '0')}:00`,
      waitTime: waitTimeTrendByHour[i]
        ? Math.round(waitTimeTrendByHour[i].times.reduce((a, b) => a + b, 0) / waitTimeTrendByHour[i].times.length)
        : 0,
    }));

    // Service duration trend (by hour)
    const serviceTrendByHour = {};
    completed.forEach(a => {
      const hour = new Date(a.completedAt || new Date()).getUTCHours();
      const st = calculateServiceTime(a);
      if (st !== null) {
        if (!serviceTrendByHour[hour]) {
          serviceTrendByHour[hour] = { times: [] };
        }
        serviceTrendByHour[hour].times.push(st);
      }
    });

    const serviceDurationTrend = Array.from({ length: 24 }, (_, i) => ({
      time: `${String(i).padStart(2, '0')}:00`,
      serviceTime: serviceTrendByHour[i]
        ? Math.round(serviceTrendByHour[i].times.reduce((a, b) => a + b, 0) / serviceTrendByHour[i].times.length)
        : 0,
    }));

    // Group by source
    const bySource = {
      online: activeAppointments.filter(a => a.createdVia === 'online').length,
      admin: activeAppointments.filter(a => a.createdVia === 'admin').length,
    };

    // Group by priority
    const byPriority = {
      normal: activeAppointments.filter(a => a.priority === 'normal').length,
      high: activeAppointments.filter(a => a.priority === 'high').length,
      emergency: activeAppointments.filter(a => a.priority === 'emergency').length,
    };

    return res.json({
      range,
      metrics,
      charts: {
        serviceDistribution: servicePerformance,
        providerDistribution: Object.values(byProvider),
        dailyTrend,
        statusBreakdown: [
          { status: 'Pending', value: metrics.byStatus.pending },
          { status: 'Confirmed', value: metrics.byStatus.confirmed },
          { status: 'Checked In', value: metrics.byStatus.queued },
          { status: 'Called', value: metrics.byStatus.called },
          { status: 'In Service', value: metrics.byStatus.inService },
          { status: 'Completed', value: metrics.byStatus.completed },
          { status: 'Cancelled', value: metrics.byStatus.cancelled },
          { status: 'No Show', value: metrics.byStatus.noShow },
        ],
        sourceBreakdown: [
          { name: 'Online', value: bySource.online },
          { name: 'Admin', value: bySource.admin },
        ],
        priorityBreakdown: [
          { name: 'Normal', value: byPriority.normal },
          { name: 'High (VIP)', value: byPriority.high },
          { name: 'Emergency', value: byPriority.emergency },
        ],
      },
      summary: {
        totalAppointments: metrics.totalAppointments,
        completionRate: metrics.completionRate,
        noShowRate: metrics.noShowRate,
        cancellationRate: metrics.cancellationRate,
        avgWaitTime,
        avgServiceTime,
      },
      waitTimeTrend,
      serviceDurationTrend,
      hourlyDistribution,
      servicePerformance,
      detailedStats: {
        peakHour,
        noShowRate: metrics.noShowRate,
        maxWaitTime,
        maxServiceTime,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/queue/peak-hours
 * Get peak hours analysis for appointment scheduling
 */
export const getPeakHoursAnalytics = async (req, res, next) => {
  try {
    const { providerId } = req.query;
    const filter = {};

    if (providerId && validateObjectId(providerId)) {
      const provider = await Provider.findOne({ _id: providerId, isActive: true });
      if (!provider) {
        return res.status(404).json({ message: 'Provider not found or inactive' });
      }
      filter.providerId = providerId;
    }

    // Get last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    filter.scheduledStart = { $gte: thirtyDaysAgo };

    const appointments = await Appointment.find(filter)
      .populate({
        path: 'providerId',
        match: { isActive: true },
        select: 'name'
      })
      .lean();

    const activeAppointments = appointments.filter(a => a.providerId);

    // Group by hour
    const byHour = {};
    activeAppointments.forEach(a => {
      const hour = new Date(a.scheduledStart).getUTCHours();
      if (!byHour[hour]) {
        byHour[hour] = { hour: `${String(hour).padStart(2, '0')}:00`, count: 0, completed: 0 };
      }
      byHour[hour].count++;
      if (a.status === 'completed') byHour[hour].completed++;
    });

    const peakHoursData = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      count: byHour[i]?.count || 0,
      completed: byHour[i]?.completed || 0,
    }));

    return res.json(peakHoursData);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/queue/staff-performance
 * Get staff performance metrics
 */
export const getStaffPerformanceAnalytics = async (req, res, next) => {
  try {
    const { providerId } = req.query;
    const filter = { assignedStaffId: { $ne: null } };

    if (providerId && validateObjectId(providerId)) {
      const provider = await Provider.findOne({ _id: providerId, isActive: true });
      if (!provider) {
        return res.status(404).json({ message: 'Provider not found or inactive' });
      }
      filter.providerId = providerId;
    }

    const appointments = await Appointment.find(filter)
      .populate('assignedStaffId', 'name')
      .populate({
        path: 'providerId',
        match: { isActive: true },
        select: 'name'
      })
      .lean();

    const activeAppointments = appointments.filter(a => a.providerId);

    // Group by staff
    const byStaff = {};
    activeAppointments.forEach(a => {
      const staffName = a.assignedStaffId?.name || 'Unassigned';
      if (!byStaff[staffName]) {
        byStaff[staffName] = {
          staff: staffName,
          total: 0,
          completed: 0,
          noShow: 0,
          cancelled: 0,
          totalWaitTime: 0,
          totalServiceTime: 0,
          waitCount: 0,
          serviceCount: 0,
        };
      }
      byStaff[staffName].total++;
      if (a.status === 'completed') {
        byStaff[staffName].completed++;
        const wt = calculateWaitTime(a);
        if (wt !== null) {
          byStaff[staffName].totalWaitTime += wt;
          byStaff[staffName].waitCount++;
        }
        const st = calculateServiceTime(a);
        if (st !== null) {
          byStaff[staffName].totalServiceTime += st;
          byStaff[staffName].serviceCount++;
        }
      }
      if (a.status === 'no_show') byStaff[staffName].noShow++;
      if (a.status === 'cancelled') byStaff[staffName].cancelled++;
    });

    // Calculate completion rates and averages
    const staffPerformance = Object.values(byStaff).map(staff => ({
      staff: staff.staff,
      total: staff.total,
      completed: staff.completed,
      noShow: staff.noShow,
      cancelled: staff.cancelled,
      completionRate: staff.total > 0 ? Math.round((staff.completed / staff.total) * 100) : 0,
      avgWaitTime: staff.waitCount > 0 ? Math.round(staff.totalWaitTime / staff.waitCount) : 0,
      avgServiceTime: staff.serviceCount > 0 ? Math.round(staff.totalServiceTime / staff.serviceCount) : 0,
    }));

    return res.json(staffPerformance.sort((a, b) => b.completed - a.completed));
  } catch (error) {
    next(error);
  }
};
