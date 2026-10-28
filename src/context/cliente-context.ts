import { createContext, useContext } from "react";

export type ClienteContextType = {
  tenantId?: number;
  cliente?: any;
  isLoading: boolean;
  error: unknown;
};

export const ClienteContext = createContext<ClienteContextType | undefined>(undefined);

export function useClienteContext() {
  const context = useContext(ClienteContext);
  if (!context) {
    throw new Error("useClienteContext deve ser usado dentro do layout de /cliente");
  }
  return context;
}
