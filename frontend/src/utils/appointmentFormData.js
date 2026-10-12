export const buildAppointmentFormData = (appointment, intakeData, requirements) => {
  // Check if there are any file uploads
  const hasFiles = requirements.some(field => {
    if (field.type === 'file') {
      const value = intakeData[field.name];
      return value instanceof File;
    }
    return false;
  });

  // If no files, return JSON object (Content-Type: application/json)
  if (!hasFiles) {
    const answers = {};
    requirements.forEach(field => {
      const value = intakeData[field.name];
      if (value !== undefined && field.type !== 'file') {
        answers[field.name] = value;
      }
    });
    return {
      ...appointment,
      intakeData: answers,
    };
  }

  // If files exist, use FormData (multipart/form-data)
  const formData = new FormData();
  Object.entries(appointment).forEach(([name, value]) => {
    if (value !== undefined && value !== null) formData.append(name, String(value));
  });

  const answers = {};
  requirements.forEach(field => {
    const value = intakeData[field.name];
    if (field.type === 'file') {
      if (value instanceof File) formData.append(`requirementFiles[${field.name}]`, value, value.name);
    } else if (value !== undefined) {
      answers[field.name] = value;
    }
  });
  formData.append('intakeData', JSON.stringify(answers));
  return formData;
};
