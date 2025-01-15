const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');
const mobyAPI = require('../../mobyAPI');

const PURPLE = '#5C3391';
const YELLOW = '#FFD700';

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

            const month = new Date().toLocaleString('en-US', { month: 'JANUARY' });
            const nominations = await database.getNominations();
            if (!nominations.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No nominations found\n[Ready for input]█\x1b[0m```');
                return;
            }

            const count = args[0] ? parseInt(args[0]) : 10;
            const selectedNoms = this.getRandomNominations(nominations, count);

            const progressEmbed = new TerminalEmbed()
                .setTerminalTitle('GENERATING NOMINATION GRAPHIC')
                .setTerminalDescription('[PROCESS INITIATED]')
                .addTerminalField('STATUS', 'Fetching game data from MobyGames API...')
                .setTerminalFooter();
            
            const progressMsg = await message.channel.send({ embeds: [progressEmbed] });

            try {
                const attachment = await this.generateGraphic(selectedNoms, progressMsg, month);
                await message.channel.send({ files: [attachment] });
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

    async generateGraphic(nominations, progressMsg, month) {
        const canvas = createCanvas(900, 1200);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#2C2C2C';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header with dark background
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, canvas.width, 100);
        
        // Draw header text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 48px Arial';
        ctx.fillText(month, 20, 60);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('RETRO CHALLENGE', 200, 60);
        
        // Draw "NOMINEES" in purple
        ctx.fillStyle = PURPLE;
        const nomineesWidth = ctx.measureText('NOMINEES').width;
        ctx.fillText('NOMINEES', canvas.width - nomineesWidth - 20, 60);

        let yOffset = 120;

        for (const [index, nom] of nominations.entries()) {
            try {
                await progressMsg.edit({
                    embeds: [new TerminalEmbed()
                        .setTerminalTitle('GENERATING NOMINATION GRAPHIC')
                        .setTerminalDescription('[PROCESS RUNNING]')
                        .addTerminalField('STATUS', `Processing game ${index + 1}/${nominations.length}: ${nom.game}`)
                        .setTerminalFooter()]
                });

                const searchResult = await mobyAPI.searchGames(nom.game);
                if (!searchResult?.games?.length) continue;

                const gameData = await mobyAPI.getGameDetails(searchResult.games[0].game_id);
                const artwork = await mobyAPI.getGameArtwork(searchResult.games[0].game_id);

                // Alternate background colors
                const isYellow = index % 2 === 1;
                ctx.fillStyle = isYellow ? YELLOW : PURPLE;
                ctx.fillRect(0, yOffset, canvas.width, 220);

                try {
                    const platformArtwork = artwork?.platforms?.find(p => 
                        p.platform_name.toLowerCase().includes(nom.platform.toLowerCase())
                    );
                    const coverUrl = platformArtwork?.cover_url || artwork?.platforms[0]?.cover_url;

                    if (coverUrl) {
                        const boxArt = await loadImage(coverUrl);
                        // Alternate box art position
                        const boxArtX = isYellow ? 20 : canvas.width - 170;
                        ctx.drawImage(boxArt, boxArtX, yOffset + 10, 150, 180);
                    }
                } catch (err) {
                    console.error('Error loading box art:', err);
                }

                // Text color and position based on background
                ctx.fillStyle = isYellow ? '#000000' : '#FFFFFF';
                const textX = isYellow ? 190 : 20;

                // Game title
                ctx.font = 'bold 36px Arial';
                const year = gameData?.first_release_date?.slice(0, 4);
                const titleText = `${nom.game} (${year || 'N/A'}, ${nom.platform})`;
                ctx.fillText(titleText, textX, yOffset + 45);

                // Genre and Metacritic
                ctx.font = 'bold 24px Arial';
                const genre = gameData?.genres?.[0]?.genre_name || 'Unknown Genre';
                const metascore = gameData?.moby_score ? Math.round(gameData.moby_score * 10) : '??';
                ctx.fillText(`${genre} (Metacritic: ${metascore})`, textX, yOffset + 80);

                // Description
                let description = gameData?.description || 'A classic retro gaming experience nominated for this month\'s challenge.';
                description = description.replace(/<[^>]*>/g, '');
                description = description.length > 300 ? 
                    description.substring(0, 297) + '...' : 
                    description;

                ctx.font = '16px Arial';
                const wrappedDesc = this.wrapText(ctx, description, 650);
                let textY = yOffset + 110;
                wrappedDesc.forEach(line => {
                    ctx.fillText(line, textX, textY);
                    textY += 20;
                });

                yOffset += 220;
            } catch (error) {
                console.error(`Error processing game ${nom.game}:`, error);
                continue;
            }
        }

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
