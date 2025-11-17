import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

const redis = Redis.fromEnv();

function getMemoryKey(userEmail: string): string {
    return `memory:${userEmail}`;
}

function getUser(request: Request): string | null {
    const userEmail = request.headers.get("x-user-email");
    return userEmail;
}

const handler = createMcpHandler((server) => {
    server.registerTool(
        "memory.remember",
        {
            title: "Remember Tool",
            description: "Store a memory item about a user's preferences, history, and key details across multiple sessions.",
            inputSchema: {
                record: z.string().describe(
                    "Details of the memory item to store such as user's preferences, history, and key details."
                ),
            }
        },
        async ({ record }, { request }) => {
            const user = getUser(request);

            if (!user) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Memory feature is not available for guest users.",
                        },
                    ],
                };
            }

            const key = getMemoryKey(user);

            try {
                const exists = await redis.exists(key);

                if (exists) {
                    await redis.json.arrappend(key, "$", record);
                } else {
                    await redis.json.set(key, "$", [record]);
                }

                const timestamp = new Date().toISOString();
                return {
                    content: [
                        {
                            type: "text",
                            text: `Stored memory about: ${record} on ${timestamp} UTC`,
                        },
                    ],
                };
            } catch (e) {
                const error = e as Error;
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error storing memory item: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    server.registerTool(
        "memory.forget",
        {
            title: "Forget Tool",
            description: "Remove a memory item by its index. This tool must be run one at a time as memory indexes change after each removal.",
            inputSchema: {
                index: z.number().int().describe("Index of the memory item to remove."),
            }
        },
        async ({ index }, { request }) => {
            const user = getUser(request);

            if (!user) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Memory feature is not available for guest users.",
                        },
                    ],
                };
            }

            const key = getMemoryKey(user);

            try {
                const result = await redis.json.arrpop(key, "$", index);

                if (result) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Removed memory item at index ${index} about: ${result[0]}`,
                            },
                        ],
                    };
                } else {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No memory item found at index ${index}.`,
                            },
                        ],
                    };
                }
            } catch (e) {
                const error = e as Error;
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error removing memory item ${index}: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    server.registerResource(
        "memory.recall",
        new ResourceTemplate('resource://memory.recall', { list: undefined }),
        {
            title: 'Recall Resource',
            description: 'Recall all stored memory items for the user.',
        },
        async ({ request }) => {
            const user = getUser(request);

            if (!user) {
                return {
                    contents: [
                        {
                            uri: "resource://memory.recall",
                            mimeType: "application/json",
                            text: JSON.stringify({ error: "User not found" }),
                        },
                    ],
                };
            }

            try {
                const key = getMemoryKey(user);
                const memory = await redis.json.get(key, "$");

                const memoryData = memory ? memory[0] : [];

                return {
                    contents: [
                        {
                            uri: "resource://memory.recall",
                            mimeType: "application/json",
                            text: JSON.stringify(memoryData),
                        },
                    ],
                };
            } catch (e) {
                const error = e as Error;
                return {
                    contents: [
                        {
                            uri: "resource://memory.recall",
                            mimeType: "application/json",
                            text: JSON.stringify({ error: error.message }),
                        },
                    ],
                };
            }
        }
    );
});

export { handler as GET, handler as POST, handler as DELETE };