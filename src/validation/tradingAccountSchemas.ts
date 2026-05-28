import { z } from "zod";

export const TradingAccountTypeSchema = z.enum(["live", "demo", "prop", "other"], {
  error: "Le type de compte doit etre live, demo, prop ou other",
});

export const TradingAccountFormDataSchema = z.object({
  name: z.string().min(1, "Le nom du compte est requis").max(120, "Nom trop long (max 120 car.)"),
  broker: z.string().min(1, "Le broker est requis").max(120, "Broker trop long (max 120 car.)"),
  brokerId: z.number().int().positive().nullable().optional(),
  platform: z.enum(["mt5", "mt4", "csv", "manual"], {
    error: "La plateforme doit etre mt5, mt4, csv ou manual",
  }),
  accountNumber: z.string().min(1, "Le numero de compte est requis").max(120, "Numero de compte trop long (max 120 car.)"),
  accountType: TradingAccountTypeSchema.optional(),
  currency: z.string().max(10, "Code devise trop long (max 10 car.)").nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateTradingAccountSchema = TradingAccountFormDataSchema.partial();
