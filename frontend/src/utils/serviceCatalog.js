export const servicesForChannel = (provider, channel) => (provider?.services || []).filter(code => {
  const service = provider.serviceCatalog?.find(item => item.code === code);
  if (!service) return true;
  if (channel === 'queue') return service.channels.includes('queue') || service.channels.includes('appointments');
  return service.channels?.includes(channel);
});

export const serviceLabel = (provider, code) =>
  provider?.serviceCatalog?.find(item => item.code === code)?.name || code;
