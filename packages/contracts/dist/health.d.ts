import { z } from 'zod';
export declare const pingResponseSchema: z.ZodObject<{
    status: z.ZodLiteral<"ok">;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "ok";
    timestamp: string;
}, {
    status: "ok";
    timestamp: string;
}>;
export type PingResponse = z.infer<typeof pingResponseSchema>;
