import { Service } from './service.model.js';
import { Location } from '../locations/location.model.js';

export const attachServiceCatalog = async providers => {
  const [catalog, locations] = await Promise.all([
    Service.find().lean(),
    Location.find({ isActive: true }).lean(),
  ]);
  
  const servicesByCode = new Map(catalog.map(service => [service.code, service]));
  const inactiveCodes = new Set(catalog.filter(service => !service.isActive).map(service => service.code));
  
  // Map providers to their locations (Location has providerId that links to Provider)
  const providerToLocations = new Map();
  for (const location of locations) {
    if (location.providerId) {
      const providerId = String(location._id);
      if (!providerToLocations.has(String(location.providerId))) {
        providerToLocations.set(String(location.providerId), []);
      }
      providerToLocations.get(String(location.providerId)).push(providerId);
    }
  }
  
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
    const providerLocationIds = providerToLocations.get(String(provider._id)) || [];
    const configuredCodes = (provider.services || [])
      .map(code => String(code).trim().toUpperCase())
      .filter(code => code && !inactiveCodes.has(code));
    
    // Services are now linked to locations
    // Match services if their location is one of this provider's locations
    const activeServices = catalog.filter(service => {
      if (!service.isActive) return false;
      
      // If service has a location, check if it matches one of this provider's locations
      if (service.location) {
        return providerLocationIds.includes(String(service.location));
      }
      
      // Fallback: check if providerId matches (legacy services)
      const serviceProviderIdMatch = String(service.providerId || legacyProviderByServiceCode.get(service.code) || '') === String(provider._id);
      return serviceProviderIdMatch;
    });
    
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
