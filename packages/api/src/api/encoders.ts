/** Encoder catalogue, forks, and parameter descriptors. */
import { useTransport } from "./client";
import { invalidateEncoders } from "./invalidate";
import { queryKeys } from "./keys";
import {
    encoderForkPath,
    encoderParametersPath,
    encodersForksPath,
    encodersPath,
    encodersProbePath,
} from "./paths";
import {
    EncoderDescriptorSchema,
    EncoderForkProbeSchema,
    EncoderForkSchema,
    type EncoderForkRequest,
    type EncoderForkUpdate,
    type EncoderParametersUpdate,
} from "@av1ation/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** The encoder catalogue with the engine's typed parameter descriptors. */
export function useEncoders() {
    const transport = useTransport();
    return useQuery({
        queryKey: queryKeys.encoders,
        queryFn: () => transport.get(encodersPath(), EncoderDescriptorSchema.array()),
        staleTime: Infinity,
    });
}

/**
 * Probes a build as a fork of one encoder family without saving it. The probe runs the
 * executable's help output through the same stamp check as the dependency inventory.
 */
export function useProbeEncoderFork() {
    const transport = useTransport();
    return useMutation({
        mutationFn: (input: EncoderForkRequest) =>
            transport.post(encodersProbePath(), input, EncoderForkProbeSchema),
    });
}

/** Saves a probed build as an extra catalogue entry beside its base encoder. */
export function useCreateEncoderFork() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: EncoderForkRequest) =>
            transport.post(encodersForksPath(), input, EncoderForkSchema),
        onSuccess: () => invalidateEncoders(queryClient),
    });
}

/** Replaces a saved fork's name, path, or parameter map. */
export function useUpdateEncoderFork() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; update: EncoderForkUpdate }) =>
            transport.putJson(encoderForkPath(input.id), input.update, EncoderForkSchema),
        onSuccess: () => invalidateEncoders(queryClient),
    });
}

/**
 * Replaces the descriptor set one built-in encoder offers. The service records the keys the
 * editor no longer shows as removals, so an engine parameter added later still appears.
 */
export function useSetEncoderParameters() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; update: EncoderParametersUpdate }) =>
            transport.put(encoderParametersPath(input.id), input.update),
        onSuccess: () => invalidateEncoders(queryClient),
    });
}

/** Restores the engine's own descriptors for one built-in encoder. */
export function useResetEncoderParameters() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => transport.delete(encoderParametersPath(id)),
        onSuccess: () => invalidateEncoders(queryClient),
    });
}

/** Drops a saved fork. The engine's built-in encoder is untouched. */
export function useDeleteEncoderFork() {
    const transport = useTransport();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => transport.delete(encoderForkPath(id)),
        onSuccess: () => invalidateEncoders(queryClient),
    });
}
