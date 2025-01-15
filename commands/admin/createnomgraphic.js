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

            try {
                // Create the graphic
                const attachment = await this.generateGraphic(selectedNoms, progressMsg);
                // Send the final graphic
                await message.channel.send({ files: [attachment] });
            } catch (error) {
                console.error('Error generating graphic:', error);
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to generate graphic\n[Ready for input]█\x1b[0m```');
            } finally {
                await progressMsg.delete().catch(console.error);
            }

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

        let yOffset = 100;

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

                // Draw section background with alternating colors (starting with purple)
                ctx.fillStyle = index % 2 === 0 ? '#5C3391' : '#FFD700';
                ctx.fillRect(0, yOffset, canvas.width, 200);

                // Try to load and draw box art on the left
                let boxArtLoaded = false;
                try {
                    let coverUrl = null;
                    // Try to find a cover for the specific platform first
                    const platformArtwork = artwork?.platforms?.find(p => 
                        p.platform_name.toLowerCase().includes(nom.platform.toLowerCase())
                    );
                    coverUrl = platformArtwork?.cover_url || artwork?.platforms[0]?.cover_url;

                    if (coverUrl) {
                        const boxArt = await loadImage(coverUrl);
                        ctx.drawImage(boxArt, 20, yOffset + 10, 150, 180);
                        boxArtLoaded = true;
                    }
                } catch (err) {
                    console.error('Error loading box art:', err);
                }

                // Text color based on background
                ctx.fillStyle = index % 2 === 0 ? '#FFFFFF' : '#000000';

                // Game title and year
                ctx.font = 'bold 32px Arial';
                const year = gameData?.first_release_date?.slice(0, 4);
                const titleText = year && year !== 'N/A' ? 
                    `${nom.game} - ${year}` : 
                    nom.game;
                ctx.fillText(titleText, boxArtLoaded ? 190 : 20, yOffset + 40);
                
                // Platform and genre
                ctx.font = '24px Arial';
                const genre = gameData?.genres?.[0]?.genre_name || 'Unknown Genre';
                ctx.fillText(`${nom.platform} - ${genre}`, boxArtLoaded ? 190 : 20, yOffset + 70);

                // Clean and truncate description
                let description = gameData?.description || 'A classic retro gaming experience nominated for this month\'s challenge.';
                // Remove HTML tags
                description = description.replace(/<[^>]*>/g, '');
                // Truncate to ~300 characters with ellipsis
                description = description.length > 300 ? 
                    description.substring(0, 297) + '...' : 
                    description;
                
                ctx.font = '16px Arial';
                const wrappedDesc = this.wrapText(ctx, description, boxArtLoaded ? 650 : 860);
                let textY = yOffset + 100;
                wrappedDesc.forEach(line => {
                    ctx.fillText(line, boxArtLoaded ? 190 : 20, textY);
                    textY += 20;
                });

                yOffset += 200;

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
