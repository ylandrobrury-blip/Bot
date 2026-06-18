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

const YOUTUBE_HANDLE = "IzAnarchymc";
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
    setInterval(checkYouTube, 5 * 60 * 1000);
});

async function getYouTubeChannelId() {
    const res = await fetch(`https://www.youtube.com/@${YOUTUBE_HANDLE}`);
    const html = await res.text();

    const match = html.match(/"channelId":"(UC[^"]+)"/);
    if (!match) throw new Error("Could not find YouTube channel ID.");

    return match[1];
}

async function checkYouTube() {
    try {
        const channelId = await getYouTubeChannelId();
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

        const res = await fetch(feedUrl);
        const xml = await res.text();

        const videoId = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
        const title = xml.match(/<title>(.*?)<\/title>/g)?.[1]
            ?.replace("<title>", "")
            ?.replace("</title>", "");

        if (!videoId || !title) return;

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        let lastVideo = null;

        if (fs.existsSync("youtube.json")) {
            lastVideo = JSON.parse(fs.readFileSync("youtube.json", "utf8")).lastVideo;
        }

        if (!lastVideo) {
            fs.writeFileSync("youtube.json", JSON.stringify({ lastVideo: videoId }));
            console.log("Saved latest YouTube video.");
            return;
        }

        if (lastVideo !== videoId) {
            fs.writeFileSync("youtube.json", JSON.stringify({ lastVideo: videoId }));

            const channel = await client.channels.fetch(YOUTUBE_NOTIFY_CHANNEL_ID);

            await channel.send({
                content: `@everyone\n\n🎥 **New YouTube video uploaded!**\n\n**${title}**\n${videoUrl}`,
                allowedMentions: { parse: ["everyone"] }
            });

            console.log("New YouTube video posted.");
        }

    } catch (error) {
        console.log("YouTube check error:", error.message);
    }
}

client.on(Events.InteractionCreate, async (interaction) => {

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
                .setCustomId(`deny_${interaction.user.id}`)
                .setLabel("Deny")
                .setStyle(ButtonStyle.Danger)
        );

        const channel = await client.channels.fetch(MOD_CHANNEL_ID);
        await channel.send({ embeds: [embed], components: [row] });

        await interaction.reply({
            content: "Your Trusted application has been sent.",
            ephemeral: true
        });
    }

    if (interaction.isButton() && interaction.customId.startsWith("approve_")) {
        const userId = interaction.customId.replace("approve_", "");
        const member = await interaction.guild.members.fetch(userId);

        await member.roles.add(TRUSTED_ROLE_ID);

        try {
            await member.send("Your Trusted application has been **accepted**!");
        } catch {}

        await interaction.update({
            content: `Accepted <@${userId}> and gave them Trusted member.`,
            embeds: interaction.message.embeds,
            components: []
        });
    }

    if (interaction.isButton() && interaction.customId.startsWith("deny_")) {
        const userId = interaction.customId.replace("deny_", "");
        const user = await client.users.fetch(userId);

        try {
            await user.send("Your Trusted application has been **denied**.");
        } catch {}

        await interaction.update({
            content: `Denied <@${userId}>.`,
            embeds: interaction.message.embeds,
            components: []
        });
    }
});

client.login(process.env.TOKEN);