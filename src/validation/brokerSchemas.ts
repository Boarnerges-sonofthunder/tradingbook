import { z } from "zod";

export const BrokerTypeSchema = z.enum(["retail", "prop", "institutional", "csv", "other"], {
  error: "Le type de broker doit etre retail, prop, institutional, csv ou other",
});

export const BrokerPlatformSchema = z.enum(["mt5", "mt4", "csv", "manual"], {
  error: "La plateforme broker doit etre mt5, mt4, csv ou manual",
});

export const BrokerFormDataSchema = z.object({
  name: z.string().min(1, "Le nom du broker est requis").max(120, "Nom de broker trop long (max 120 car.)"),
  brokerType: BrokerTypeSchema.optional(),
  platformSupported: z.array(BrokerPlatformSchema).min(1, "Au moins une plateforme est requise").optional(),
  website: z.string().url("Le site web doit etre une URL valide").max(255, "URL trop longue (max 255 car.)").nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateBrokerSchema = BrokerFormDataSchema.partial();
