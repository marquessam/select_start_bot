const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');
const mobyAPI = require('../../mobyAPI');

const createNominationGraphic = {
    name: 'createnomgraphic',
    description: 'Create a graphic with random nominations',

    async execute(message, args) {
        try {
            // Check admin permissions
            const hasPermission = message.member && (
                message.member.permissions.has('Administrator') ||
                message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
            );

            if (!hasPermission) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Get current nominations
            const nominations = await database.getNominations();
            if (!nominations.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No nominations found\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Select random nominations (default 10 or specified amount)
            const count = args[0] ? parseInt(args[0]) : 10;
            const selectedNoms = this.getRandomNominations(nominations, count);

            // Create progress embed
            const progressEmbed = new TerminalEmbed()
                .setTerminalTitle('GENERATING NOMINATION GRAPHIC')
                .setTerminalDescription('[PROCESS INITIATED]')
                .addTerminalField('STATUS', 'Fetching game data from MobyGames API...')
                .setTerminalFooter();
            
            const progressMsg = await message.channel.send({ embeds: [progressEmbed] });

            // Create the graphic
            const attachment = await this.generateGraphic(selectedNoms, progressMsg);

            // Send the final graphic
            await message.channel.send({ files: [attachment] });
            await progressMsg.delete().catch(console.error);

        } catch (error) {
            console.error('Create Nomination Graphic Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to generate nomination graphic\n[Ready for input]█\x1b[0m```');
        }
    },

    getRandomNominations(nominations, count) {
        const shuffled = [...nominations].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, nominations.length));
    },

    async generateGraphic(nominations, progressMsg) {
        // Canvas setup
        const canvas = createCanvas(900, 1200);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#2C2C2C';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header with dark background
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, canvas.width, 100);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 48px Arial';
        const title = 'MONTHLY RETRO NOMINEES';
        const titleWidth = ctx.measureText(title).width;
        ctx.fillText(title, (canvas.width - titleWidth) / 2, 60);

        let yOffset = 120;

        // Process each nomination
        for (const [index, nom] of nominations.entries()) {
            try {
                // Update progress
                await progressMsg.edit({
                    embeds: [new TerminalEmbed()
                        .setTerminalTitle('GENERATING NOMINATION GRAPHIC')
                        .setTerminalDescription('[PROCESS RUNNING]')
                        .addTerminalField('STATUS', `Processing game ${index + 1}/${nominations.length}: ${nom.game}`)
                        .setTerminalFooter()]
                });

                // Search MobyGames for the game
                const searchResult = await mobyAPI.searchGames(nom.game);
                if (!searchResult?.games?.length) continue;

                // Get the most relevant result
                const gameData = await mobyAPI.getGameDetails(searchResult.games[0].game_id);
                const artwork = await mobyAPI.getGameArtwork(searchResult.games[0].game_id);

                // Draw section background with alternating colors
                ctx.fillStyle = index % 2 === 0 ? '#FFD700' : '#5C3391';
                ctx.fillRect(0, yOffset, canvas.width, 200);

                // Try to load and draw box art
                try {
                    const coverUrl = artwork?.platforms[0]?.cover_url;
                    if (coverUrl) {
                        const boxArt = await loadImage(coverUrl);
                        // Move box art to the right side
                        ctx.drawImage(boxArt, canvas.width - 170, yOffset + 10, 150, 180);
                    }
                } catch (err) {
                    console.error('Error loading box art:', err);
                }

                // Game title and year
                ctx.fillStyle = index % 2 === 0 ? '#000000' : '#FFFFFF';
                ctx.font = 'bold 32px Arial';
                const year = gameData?.first_release_date?.slice(0, 4) || 'N/A';
                ctx.fillText(`${nom.game} - ${year}`, 20, yOffset + 40);
                
                // Platform and genre
                ctx.font = '24px Arial';
                const genre = gameData?.genres?.[0]?.genre_name || 'Unknown Genre';
                ctx.fillText(`${nom.platform} - ${genre}`, 20, yOffset + 70);

                // Clean and truncate description
                let description = gameData?.description || 'A classic retro gaming experience nominated for this month\'s challenge.';
                // Remove HTML tags
                description = description.replace(/<[^>]*>/g, '');
                // Truncate to ~100 characters with ellipsis
                description = description.length > 100 ? 
                    description.substring(0, 97) + '...' : 
                    description;
                
                ctx.font = '16px Arial';
                const wrappedDesc = this.wrapText(ctx, description, 650);
                let textY = yOffset + 100;
                wrappedDesc.forEach(line => {
                    ctx.fillText(line, 20, textY);
                    textY += 20;
                });

                yOffset += 220;

            } catch (error) {
                console.error(`Error processing game ${nom.game}:`, error);
                continue;
            }
        }

        // Convert canvas to attachment
        const buffer = canvas.toBuffer('image/png');
        return new AttachmentBuilder(buffer, { name: 'nominations.png' });
    },

    wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    }
};

module.exports = createNominationGraphic;
