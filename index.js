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

const MOD_CHANNEL_ID = "1481306497236336733";
const TRUSTED_ROLE_ID = "1517157408550420611";

const YOUTUBE_CHANNEL_ID = "UC1hjsoHtMeab2eiEW3Yg8bw";
const YOUTUBE_NOTIFY_CHANNEL_ID = "1515784371150258226";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.once(Events.ClientReady, async () => {
    console.log(`Bot is online as ${client.user.tag}`);

    checkYouTube();
    setInterval(checkYouTube, 60 * 1000);
});

async function checkYouTube() {
    try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
        const res = await fetch(feedUrl);
        const xml = await res.text();

        const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

        let postedVideos = [];

        if (fs.existsSync("youtube.json")) {
            const data = JSON.parse(fs.readFileSync("youtube.json", "utf8"));
            postedVideos = data.postedVideos || [];
        }

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

        fs.writeFileSync("youtube.json", JSON.stringify({ postedVideos }, null, 2));

    } catch (error) {
        console.log("YouTube check error:", error.message);
    }
}

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
                    content: "Click the button below to apply for **Trusted member**.",
                    components: [row]
                });
            }
        }

        if (interaction.isButton() && interaction.customId === "trusted_apply") {
            const modal = new ModalBuilder()
                .setCustomId("trusted_modal")
                .setTitle("Trusted Application");

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
            const embed = new EmbedBuilder()
                .setTitle("New Trusted Application")
                .setColor("Blue")
                .setDescription(`Applicant: ${interaction.user}\nUser ID: ${interaction.user.id}`)
                .addFields(
                    { name: "Why do you truly deserve Trusted?", value: interaction.fields.getTextInputValue("q1") },
                    { name: "What does trust mean to you?", value: interaction.fields.getTextInputValue("q2") },
                    { name: "If your friend breaks rules, what do you do?", value: interaction.fields.getTextInputValue("q3") },
                    { name: "Tell us a mistake you made and learned from.", value: interaction.fields.getTextInputValue("q4") },
                    { name: "If we deny you, how will you react?", value: interaction.fields.getTextInputValue("q5") }
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
                content: "Your Trusted application has been sent.",
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

            modal.addComponents(
                new ActionRowBuilder().addComponents(reasonInput)
            );

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

            modal.addComponents(
                new ActionRowBuilder().addComponents(infoInput)
            );

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