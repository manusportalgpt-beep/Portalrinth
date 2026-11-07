package com.modrinth.theseus.agent.transformers;

import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

/**
 * Counts rendered frames: the game draws by handing each finished frame to
 * GLFW's {@code glfwSwapBuffers}, once per frame. That method is the perfect
 * probe point because LWJGL classes are never obfuscated and never remapped -
 * its name and descriptor are identical in every Minecraft version, on every
 * loader.
 *
 * The injected call is static, takes nothing, returns nothing and cannot
 * throw (the probe catches everything internally). If the method cannot be
 * found with certainty, the transformer bails and the game runs byte-for-byte
 * as it would have without it.
 */
public final class GlfwTransformer extends ClassNodeTransformer {
    private static final String SWAP_BUFFERS_NAME = "glfwSwapBuffers";
    private static final String SWAP_BUFFERS_DESC = "(J)V";
    private static final String FRAME_HOOK =
            "com/modrinth/theseus/agent/FpsProbe";

    @Override
    protected boolean transform(ClassNode classNode) {
        MethodNode swapBuffers = null;
        for (final MethodNode method : classNode.methods) {
            if (method.name.equals(SWAP_BUFFERS_NAME)
                    && method.desc.equals(SWAP_BUFFERS_DESC)) {
                if (swapBuffers != null) {
                    // Two methods by the same name and descriptor: do not
                    // guess which one draws frames.
                    return false;
                }
                swapBuffers = method;
            }
        }
        if (swapBuffers == null) {
            return false;
        }

        // At a static method's entry the stack is empty and this call leaves
        // it empty, so no frames or maxima need recomputing beyond what the
        // writer already does.
        swapBuffers.instructions.insert(new MethodInsnNode(
                Opcodes.INVOKESTATIC, FRAME_HOOK, "frame", "()V", false));
        return true;
    }
}
