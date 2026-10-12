import { Service } from './service.model.js';

export const attachServiceCatalog = async providers => {
  const catalog = await Service.find().lean();
  const servicesByCode = new Map(catalog.map(service => [service.code, service]));
  const inactiveCodes = new Set(catalog.filter(service => !service.isActive).map(service => service.code));
  const legacyProviderByServiceCode = new Map();
  for (const provider of providers) {
    for (const rawCode of provider.services || []) {
      const code = String(rawCode).trim().toUpperCase();
      if (code && !legacyProviderByServiceCode.has(code)) {
        legacyProviderByServiceCode.set(code, String(provider._id));
      }
    }
  }
  return providers.map(provider => {
    const configuredCodes = (provider.services || [])
      .map(code => String(code).trim().toUpperCase())
      .filter(code => code && !inactiveCodes.has(code));
    const activeServices = catalog.filter(service => service.isActive &&
      String(service.providerId || legacyProviderByServiceCode.get(service.code) || '') === String(provider._id));
    // Only include legacy services if they're not in the inactive codes list
    const legacyServices = configuredCodes.filter(code => !servicesByCode.has(code) && !inactiveCodes.has(code));
    const services = [...new Set([...legacyServices, ...activeServices.map(service => service.code)])];
    const serviceCatalog = activeServices.map(({ code, name, description, channels, durationMinutes, requirements }) => ({
      code, name, description, channels, durationMinutes, requirements,
    }));
    const serviceConfigurations = (provider.serviceConfigurations || [])
      .filter(configuration => services.includes(String(configuration.serviceCode).toUpperCase()));
    for (const service of activeServices) {
      if (!services.includes(service.code) || !service.requirements?.length) continue;
      const existing = serviceConfigurations.find(configuration => configuration.serviceCode === service.code);
      if (existing) existing.fields = service.requirements;
      else serviceConfigurations.push({ serviceCode: service.code, fields: service.requirements });
    }
    return { ...provider, services, serviceCatalog, serviceConfigurations };
  });
};
