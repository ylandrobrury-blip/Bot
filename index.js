require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");

// ===== IDs =====
const MOD_CHANNEL_ID = "1481306497236336733";
const TRUSTED_ROLE_ID = "1517157408550420611";

const YOUTUBE_CHANNEL_ID = "UC1hjsoHtMeab2eiEW3Yg8bw";
const YOUTUBE_NOTIFY_CHANNEL_ID = "1515784371150258226";

// ===== Files =====
const QUEUE_FILE = "queue.json";
const YOUTUBE_FILE = "youtube.json";
const ATTEMPTS_FILE = "attempts.json";

// ===== Queue Data =====
let queueData = {
    channelId: null,
    messageId: null,
    open: false,
    users: []
};

function ensureFile(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    }
}

function loadQueue() {
    ensureFile(QUEUE_FILE, queueData);
    queueData = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
}

function saveQueue() {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queueData, null, 2));
}

function loadAttempts() {
    ensureFile(ATTEMPTS_FILE, {});
    return JSON.parse(fs.readFileSync(ATTEMPTS_FILE, "utf8"));
}

function saveAttempts(data) {
    fs.writeFileSync(ATTEMPTS_FILE, JSON.stringify(data, null, 2));
}

function getQueueEmbed() {
    const list = queueData.users.length === 0
        ? "Nobody is in the queue."
        : queueData.users.map((id, index) => `${index + 1}. <@${id}>`).join("\n");

    return new EmbedBuilder()
        .setTitle(queueData.open ? "🟢 Queue Open" : "🔴 Queue Closed")
        .setDescription(list)
        .setColor(queueData.open ? "Green" : "Red")
        .setFooter({ text: `Total people: ${queueData.users.length}` })
        .setTimestamp();
}

async function updateQueueMessage(client) {
    if (!queueData.channelId || !queueData.messageId) return;

    try {
        const channel = await client.channels.fetch(queueData.channelId);
        const message = await channel.messages.fetch(queueData.messageId);

        const button = new ButtonBuilder()
            .setCustomId("join_queue")
            .setLabel("Join Queue")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!queueData.open);

        const row = new ActionRowBuilder().addComponents(button);

        await message.edit({
            embeds: [getQueueEmbed()],
            components: [row]
        });
    } catch (error) {
        console.log("Queue update error:", error.message);
    }
}

// ===== Auto Review =====
function autoReviewApplication(answers) {
    let score = 0;
    const reasons = [];
    const allText = answers.join(" ").toLowerCase();
    const totalLength = answers.join("").length;

    const trollWords = ["idk", "lol", "lmao", "haha", "trust me bro", "fuck", "stupid", "yes", "no"];

    for (const answer of answers) {
        const clean = answer.trim().toLowerCase();

        if (clean.length >= 80) score += 2;
        else if (clean.length >= 35) score += 1;
        else {
            score -= 2;
            reasons.push("One or more answers are too short.");
        }

        if (clean.split(" ").length >= 12) score += 1;
    }

    if (totalLength >= 400) score += 2;

    if (totalLength < 120) {
        score -= 4;
        reasons.push("Application is not detailed enough.");
    }

    for (const word of trollWords) {
        if (allText.includes(word)) {
            score -= 4;
            reasons.push("Answers look unserious.");
            break;
        }
    }

    if (
        allText.includes("rules") ||
        allText.includes("honest") ||
        allText.includes("respect") ||
        allText.includes("fair") ||
        allText.includes("responsible")
    ) {
        score += 3;
    }

    let recommendation = "⚠️ Needs Review";
    let color = "Yellow";

    if (score >= 8) {
        recommendation = "✅ Recommended Accept";
        color = "Green";
    } else if (score <= 1) {
        recommendation = "❌ Recommended Deny";
        color = "Red";
    }

    if (reasons.length === 0) {
        reasons.push("Answers look okay, but staff should still review.");
    }

    return {
        score,
        recommendation,
        color,
        reason: reasons.join("\n")
    };
}

// ===== Client =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.once(Events.ClientReady, async () => {
    console.log(`Bot is online as ${client.user.tag}`);

    loadQueue();

    checkYouTube();
    setInterval(checkYouTube, 60 * 1000);

    setInterval(() => {
        updateQueueMessage(client);
    }, 5 * 60 * 1000);
});

// ===== YouTube =====
async function checkYouTube() {
    try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
        const res = await fetch(feedUrl);
        const xml = await res.text();

        const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

        ensureFile(YOUTUBE_FILE, { postedVideos: [] });

        const data = JSON.parse(fs.readFileSync(YOUTUBE_FILE, "utf8"));
        const postedVideos = data.postedVideos || [];

        const channel = await client.channels.fetch(YOUTUBE_NOTIFY_CHANNEL_ID);

        for (const video of videos.reverse()) {
            const entry = video[1];
            const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
            const title = entry.match(/<title>(.*?)<\/title>/)?.[1];

            if (!videoId || !title) continue;

            if (!postedVideos.includes(videoId)) {
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

                await channel.send({
                    content: `@everyone\n\n🎥 **New YouTube video uploaded!**\n\n**${title}**\n${videoUrl}`,
                    allowedMentions: { parse: ["everyone"] }
                });

                postedVideos.push(videoId);
                console.log(`Posted YouTube video: ${title}`);
            }
        }

        fs.writeFileSync(YOUTUBE_FILE, JSON.stringify({ postedVideos }, null, 2));

    } catch (error) {
        console.log("YouTube check error:", error.message);
    }
}

// ===== Interactions =====
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === "setuptrusted") {
                const button = new ButtonBuilder()
                    .setCustomId("trusted_apply")
                    .setLabel("Apply For Trusted")
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder().addComponents(button);

                await interaction.reply({
                    content: "Click below to apply for **Trusted member**.",
                    components: [row]
                });
            }

            if (interaction.commandName === "setupqueue") {
                const channel = interaction.options.getChannel("channel");

                queueData.channelId = channel.id;
                queueData.messageId = null;
                queueData.open = false;
                queueData.users = [];
                saveQueue();

                await interaction.reply({
                    content: `Queue channel set to ${channel}.`,
                    flags: 64
                });
            }

            if (interaction.commandName === "queue") {
                const subcommand = interaction.options.getSubcommand();

                if (subcommand === "open") {
                    if (!queueData.channelId) {
                        return interaction.reply({
                            content: "Use `/setupqueue` first.",
                            flags: 64
                        });
                    }

                    queueData.open = true;
                    saveQueue();

                    const channel = await client.channels.fetch(queueData.channelId);

                    const button = new ButtonBuilder()
                        .setCustomId("join_queue")
                        .setLabel("Join Queue")
                        .setStyle(ButtonStyle.Primary);

                    const row = new ActionRowBuilder().addComponents(button);

                    const msg = await channel.send({
                        content: "@everyone Queue is now open!",
                        embeds: [getQueueEmbed()],
                        components: [row],
                        allowedMentions: { parse: ["everyone"] }
                    });

                    queueData.messageId = msg.id;
                    saveQueue();

                    await interaction.reply({
                        content: "Queue opened.",
                        flags: 64
                    });
                }

                if (subcommand === "close") {
                    queueData.open = false;
                    queueData.users = [];
                    saveQueue();

                    await updateQueueMessage(client);

                    await interaction.reply({
                        content: "Queue closed and everyone was removed from the queue.",
                        flags: 64
                    });
                }

                if (subcommand === "list") {
                    await interaction.reply({
                        embeds: [getQueueEmbed()],
                        flags: 64
                    });
                }

                if (subcommand === "leave") {
                    const user = interaction.options.getUser("user");

                    if (!queueData.users.includes(user.id)) {
                        return interaction.reply({
                            content: `${user} is not in the queue.`,
                            flags: 64
                        });
                    }

                    queueData.users = queueData.users.filter(id => id !== user.id);
                    saveQueue();

                    await updateQueueMessage(client);

                    await interaction.reply({
                        content: `${user} has been removed. Everyone moved up one place.`,
                        flags: 64
                    });
                }
            }
        }

        if (interaction.isButton() && interaction.customId === "join_queue") {
            if (!queueData.open) {
                return interaction.reply({
                    content: "The queue is closed.",
                    flags: 64
                });
            }

            if (queueData.users.includes(interaction.user.id)) {
                return interaction.reply({
                    content: "You are already in the queue.",
                    flags: 64
                });
            }

            queueData.users.push(interaction.user.id);
            saveQueue();

            await updateQueueMessage(client);

            await interaction.reply({
                content: `You joined the queue. Your position is **${queueData.users.length}**.`,
                flags: 64
            });
        }

        if (interaction.isButton() && interaction.customId === "trusted_apply") {
            const attempts = loadAttempts();
            const used = attempts[interaction.user.id] || 0;

            if (used >= 3) {
                return interaction.reply({
                    content: "❌ You have already used all **3 chances** to apply for Trusted member.",
                    flags: 64
                });
            }

            const modal = new ModalBuilder()
                .setCustomId("trusted_modal")
                .setTitle(`Trusted Application (${used + 1}/3)`);

            const q1 = new TextInputBuilder()
                .setCustomId("q1")
                .setLabel("Why do you truly deserve Trusted?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const q2 = new TextInputBuilder()
                .setCustomId("q2")
                .setLabel("What does trust mean to you?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const q3 = new TextInputBuilder()
                .setCustomId("q3")
                .setLabel("If your friend breaks rules, what do you do?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const q4 = new TextInputBuilder()
                .setCustomId("q4")
                .setLabel("Tell us a mistake you made and learned from.")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const q5 = new TextInputBuilder()
                .setCustomId("q5")
                .setLabel("If we deny you, how will you react?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(q1),
                new ActionRowBuilder().addComponents(q2),
                new ActionRowBuilder().addComponents(q3),
                new ActionRowBuilder().addComponents(q4),
                new ActionRowBuilder().addComponents(q5)
            );

            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === "trusted_modal") {
            const attempts = loadAttempts();
            attempts[interaction.user.id] = (attempts[interaction.user.id] || 0) + 1;
            saveAttempts(attempts);

            const answers = [
                interaction.fields.getTextInputValue("q1"),
                interaction.fields.getTextInputValue("q2"),
                interaction.fields.getTextInputValue("q3"),
                interaction.fields.getTextInputValue("q4"),
                interaction.fields.getTextInputValue("q5")
            ];

            const review = autoReviewApplication(answers);

            const embed = new EmbedBuilder()
                .setTitle("New Trusted Application")
                .setColor(review.color)
                .setDescription(`Applicant: ${interaction.user}\nUser ID: ${interaction.user.id}\nAttempt: **${attempts[interaction.user.id]}/3**`)
                .addFields(
                    { name: "🤖 Bot Recommendation", value: `${review.recommendation}\nScore: **${review.score}/10**\n${review.reason}` },
                    { name: "Why do you truly deserve Trusted?", value: answers[0] },
                    { name: "What does trust mean to you?", value: answers[1] },
                    { name: "If your friend breaks rules, what do you do?", value: answers[2] },
                    { name: "Tell us a mistake you made and learned from.", value: answers[3] },
                    { name: "If we deny you, how will you react?", value: answers[4] }
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${interaction.user.id}`)
                    .setLabel("Approve")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`denyreason_${interaction.user.id}`)
                    .setLabel("Deny")
                    .setStyle(ButtonStyle.Danger),

                new ButtonBuilder()
                    .setCustomId(`moreinfo_${interaction.user.id}`)
                    .setLabel("More Info")
                    .setStyle(ButtonStyle.Secondary)
            );

            const channel = await client.channels.fetch(MOD_CHANNEL_ID);
            await channel.send({ embeds: [embed], components: [row] });

            await interaction.reply({
                content: `Your Trusted application has been sent. Attempts used: **${attempts[interaction.user.id]}/3**.`,
                flags: 64
            });
        }

        if (interaction.isButton() && interaction.customId.startsWith("approve_")) {
            const userId = interaction.customId.replace("approve_", "");
            const member = await interaction.guild.members.fetch(userId);

            await member.roles.add(TRUSTED_ROLE_ID);

            try {
                await member.send("✅ Your Trusted application has been **accepted**! You received the **Trusted member** role.");
            } catch {}

            await interaction.update({
                content: `✅ Accepted <@${userId}> and gave them Trusted member.`,
                embeds: interaction.message.embeds,
                components: []
            });
        }

        if (interaction.isButton() && interaction.customId.startsWith("denyreason_")) {
            const userId = interaction.customId.replace("denyreason_", "");

            const modal = new ModalBuilder()
                .setCustomId(`deny_modal_${userId}`)
                .setTitle("Deny Application");

            const reasonInput = new TextInputBuilder()
                .setCustomId("deny_reason")
                .setLabel("Why are you denying this application?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith("deny_modal_")) {
            const userId = interaction.customId.replace("deny_modal_", "");
            const reason = interaction.fields.getTextInputValue("deny_reason");

            const user = await client.users.fetch(userId);

            try {
                await user.send(`❌ Your Trusted application has been **denied**.\n\n**Reason:**\n${reason}`);
            } catch {}

            await interaction.update({
                content: `❌ Denied <@${userId}>.\n\n**Reason:** ${reason}`,
                embeds: interaction.message.embeds,
                components: []
            });
        }

        if (interaction.isButton() && interaction.customId.startsWith("moreinfo_")) {
            const userId = interaction.customId.replace("moreinfo_", "");

            const modal = new ModalBuilder()
                .setCustomId(`moreinfo_modal_${userId}`)
                .setTitle("Request More Info");

            const infoInput = new TextInputBuilder()
                .setCustomId("moreinfo_message")
                .setLabel("What extra info do you need?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(infoInput));

            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith("moreinfo_modal_")) {
            const userId = interaction.customId.replace("moreinfo_modal_", "");
            const message = interaction.fields.getTextInputValue("moreinfo_message");

            const user = await client.users.fetch(userId);

            try {
                await user.send(`⏳ Your Trusted application needs **more information**.\n\n**Message from moderators:**\n${message}`);
            } catch {}

            await interaction.update({
                content: `⏳ Asked <@${userId}> for more information.\n\n**Message:** ${message}`,
                embeds: interaction.message.embeds,
                components: []
            });
        }

    } catch (error) {
        console.log("Interaction error:", error);
    }
});

client.login(process.env.TOKEN);