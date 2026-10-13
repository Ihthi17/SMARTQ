import { Provider } from './provider.model.js';
import { Service } from './service.model.js';
import { Location } from '../locations/location.model.js';

export const seedProvidersAndServices = async () => {
  try {
    console.log('[SEED] Checking providers and services...');

    // Find default location
    const location = await Location.findOne({ isActive: true }).lean();
    if (!location) {
      console.log('[SEED] No active location found, cannot seed services');
      return;
    }

    console.log('[SEED] Found location:', location.name);

    // Find or create default provider
    let provider = await Provider.findOne({ code: 'DEFAULT' });
    if (!provider) {
      provider = await Provider.create({
        name: 'Default Provider',
        code: 'DEFAULT',
        type: 'branch',
        branch: {
          name: 'Main Branch',
          code: 'MAIN',
          address: location.address || 'Main Location',
        },
        isActive: true,
      });
      console.log('[SEED] Created default provider:', provider._id);
    } else {
      console.log('[SEED] Found existing provider:', provider._id);
    }

    // Seed OPD service with requirements
    let opdService = await Service.findOne({ code: 'OPD-0001' });
    if (!opdService) {
      opdService = await Service.create({
        code: 'OPD-0001',
        name: 'Out-Patient Department',
        description: 'General outpatient service',
        providerId: provider._id,
        location: location._id,
        channels: ['appointments', 'queue'],
        durationMinutes: 15,
        requiresDateTime: true,
        requirements: [
          {
            name: 'reason',
            label: 'Reason for Visit',
            type: 'textarea',
            required: true,
            options: [],
          },
          {
            name: 'medical_history',
            label: 'Known Medical Conditions',
            type: 'text',
            required: false,
            options: [],
          },
          {
            name: 'medications',
            label: 'Current Medications',
            type: 'text',
            required: false,
            options: [],
          },
        ],
        isActive: true,
      });
      console.log('[SEED] Created OPD service with 3 requirements:', opdService._id);
    } else {
      // Always ensure OPD has requirements, even if it existed
      opdService = await Service.findOneAndUpdate(
        { code: 'OPD-0001' },
        {
          $set: {
            requirements: [
              {
                name: 'reason',
                label: 'Reason for Visit',
                type: 'textarea',
                required: true,
                options: [],
              },
              {
                name: 'medical_history',
                label: 'Known Medical Conditions',
                type: 'text',
                required: false,
                options: [],
              },
              {
                name: 'medications',
                label: 'Current Medications',
                type: 'text',
                required: false,
                options: [],
              },
            ],
          },
        },
        { new: true },
      );
      console.log('[SEED] Ensured OPD service has requirements');
    }

    // Seed Consultation service with requirements
    let consultService = await Service.findOne({ code: 'CONS-0001' });
    if (!consultService) {
      consultService = await Service.create({
        code: 'CONS-0001',
        name: 'Consultation',
        description: 'Doctor consultation service',
        providerId: provider._id,
        location: location._id,
        channels: ['appointments'],
        durationMinutes: 30,
        requiresDateTime: true,
        requirements: [
          {
            name: 'consultation_type',
            label: 'Type of Consultation',
            type: 'select',
            required: true,
            options: ['General', 'Follow-up', 'Emergency'],
          },
          {
            name: 'report_file',
            label: 'Medical Report',
            type: 'file',
            required: false,
            options: [],
          },
          {
            name: 'phone_contact',
            label: 'Contact Phone',
            type: 'tel',
            required: true,
            options: [],
          },
        ],
        isActive: true,
      });
      console.log('[SEED] Created Consultation service with 3 requirements:', consultService._id);
    } else {
      console.log('[SEED] Consultation service already exists');
    }

    // Seed Lab Test service with requirements
    let labService = await Service.findOne({ code: 'LAB-0001' });
    if (!labService) {
      labService = await Service.create({
        code: 'LAB-0001',
        name: 'Laboratory Tests',
        description: 'Blood and lab testing',
        providerId: provider._id,
        location: location._id,
        channels: ['appointments', 'queue'],
        durationMinutes: 10,
        requiresDateTime: true,
        requirements: [
          {
            name: 'test_type',
            label: 'Type of Test',
            type: 'select',
            required: true,
            options: ['Blood Test', 'X-Ray', 'Ultrasound', 'ECG'],
          },
          {
            name: 'fasting_required',
            label: 'Fasting Required',
            type: 'checkbox',
            required: false,
            options: [],
          },
          {
            name: 'test_comments',
            label: 'Additional Notes',
            type: 'textarea',
            required: false,
            options: [],
          },
        ],
        isActive: true,
      });
      console.log('[SEED] Created Lab Test service with 3 requirements:', labService._id);
    } else {
      console.log('[SEED] Lab Test service already exists');
    }

    // Register services on provider
    await Provider.updateOne(
      { _id: provider._id },
      {
        $set: {
          services: ['OPD-0001', 'CONS-0001', 'LAB-0001'],
        },
      },
    );

    console.log('[SEED] Successfully seeded providers and services with requirements');
  } catch (err) {
    console.error('[SEED ERROR] Failed to seed providers:', err.message);
    throw err;
  }
};
