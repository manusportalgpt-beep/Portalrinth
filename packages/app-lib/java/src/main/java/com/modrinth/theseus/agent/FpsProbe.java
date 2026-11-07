package com.modrinth.theseus.agent;

import com.google.gson.reflect.TypeToken;
import com.modrinth.theseus.rpc.TheseusRpc;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Counts the frames the game actually renders and keeps the per-session
 * record of the slowest and the fastest second.
 *
 * The hook lives in {@code GlfwTransformer}: one injected call per rendered
 * frame, straight into the one LWJGL method the game cannot draw without.
 * Everything here is defensive by design - the probe runs on the render
 * thread, so it never blocks, never allocates per frame, and swallows every
 * throwable: a frame that cannot be counted must still be drawn.
 */
public final class FpsProbe {
    private static final long NS_PER_SECOND = 1_000_000_000L;
    private static final long REPORT_INTERVAL_NS = 5L * NS_PER_SECOND;
    private static final Object LOCK = new Object();

    private static long bucketStartNs;
    private static long bucketFrames;
    private static long windowStartNs;
    private static long windowFrames;
    private static long lastReportNs;
    private static long sessionMinFps = -1;
    private static long sessionMaxFps;

    private FpsProbe() {}

    /**
     * Called once per rendered frame from the injected {@code glfwSwapBuffers}
     * call. Cheap on purpose: one clock read and two counter bumps under a
     * short lock.
     */
    public static void frame() {
        try {
            final long now = System.nanoTime();
            boolean reportDue = false;
            synchronized (LOCK) {
                if (bucketStartNs == 0) {
                    bucketStartNs = now;
                    windowStartNs = now;
                    lastReportNs = now;
                }
                bucketFrames++;
                windowFrames++;

                final long elapsed = now - bucketStartNs;
                if (elapsed >= NS_PER_SECOND) {
                    // Frames the second's worth of time actually carried: a
                    // freeze shows up as a near-zero second, exactly what the
                    // session's minimum is there to remember.
                    final long fps = Math.max(0, bucketFrames * NS_PER_SECOND / elapsed);
                    if (sessionMinFps < 0 || fps < sessionMinFps) {
                        sessionMinFps = fps;
                    }
                    if (fps > sessionMaxFps) {
                        sessionMaxFps = fps;
                    }
                    bucketStartNs = now;
                    bucketFrames = 0;
                }

                if (now - lastReportNs >= REPORT_INTERVAL_NS) {
                    lastReportNs = now;
                    reportDue = true;
                }
            }
            if (reportDue) {
                report();
            }
        } catch (Throwable ignored) {
            // A probe must never break the frame it is called from.
        }
    }

    private static void report() {
        final Map<String, Long> payload = new LinkedHashMap<>();
        synchronized (LOCK) {
            final long windowNs = Math.max(1, lastReportNs - windowStartNs);
            payload.put("fps", Math.max(0, windowFrames * NS_PER_SECOND / windowNs));
            payload.put("min", Math.max(0, sessionMinFps));
            payload.put("max", sessionMaxFps);
            windowStartNs = lastReportNs;
            windowFrames = 0;
        }
        try {
            // Fire and forget: the launcher answers, but nobody here waits.
            TheseusRpc.getRpc().callMethod(new TypeToken<Void>() {}, "fps_report", payload);
        } catch (Throwable ignored) {
            // No RPC connection (or a launcher that predates the probe): keep
            // counting, tell nobody.
        }
    }
}
