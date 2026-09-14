export const enterprise = {
  name: import.meta.env.VITE_NAME_ENTERPRISE,
  email: import.meta.env.VITE_EMAIL_SUPPORT,
  whatsapp: import.meta.env.VITE_CONTACT_SUPPORT,
  logo: import.meta.env.VITE_LOGO,
};

export function formatPhone(phone: string) {
  const numbers = phone.replace(/\D/g, "");

  if (numbers.length === 13) {
    return `(${numbers.slice(2, 4)}) ${numbers.slice(4, 9)}-${numbers.slice(9)}`;
  }

  if (numbers.length === 12) {
    return `(${numbers.slice(2, 4)}) ${numbers.slice(4, 8)}-${numbers.slice(8)}`;
  }

  return phone;
}
