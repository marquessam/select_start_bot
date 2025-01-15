const { createCanvas, loadImage } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

const SPACING = {
    BETWEEN_GAMES: 240,    // Increased from 220
    GAME_HEIGHT: 200,      // Height of each game section
    MARGIN: 20            // Margin between sections
};

const createNominationGraphic = {
    name: 'createnomgraphic',
    description: 'Create a graphic with random nominations',

    async execute(message, args, { mobyAPI }) {
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

            const month = new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase();
            const nominations = await database.getNominations();
            if (!nominations.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No nominations found\n[Ready for input]█\x1b[0m```');
                return;
            }

            const count = args[0] ? parseInt(args[0]) : 10;
            const selectedNoms = this.getRandomNominations(nominations, count);
            const processedGames = [];

            const progressEmbed = new TerminalEmbed()
                .setTerminalTitle('GENERATING NOMINATION GRAPHIC')
                .setTerminalDescription('[PROCESS INITIATED]')
                .addTerminalField('STATUS', 'Processing nominations...')
                .setTerminalFooter();
            
            const progressMsg = await message.channel.send({ embeds: [progressEmbed] });

            // Process each game, potentially with user interaction
            for (const nom of selectedNoms) {
                const gameData = await this.processGame(message, nom, mobyAPI);
                if (gameData) {
                    processedGames.push({ ...nom, ...gameData });
                }
            }

            try {
                const attachment = await this.generateGraphic(processedGames, progressMsg, month);
                await message.channel.send({ files: [attachment] });
            } finally {
                await progressMsg.delete().catch(console.error);
            }

        } catch (error) {
            console.error('Create Nomination Graphic Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to generate nomination graphic\n[Ready for input]█\x1b[0m```');
        }
    },

    async processGame(message, nom, mobyAPI) {
        try {
            // Initial search
            const searchResult = await mobyAPI.searchGames(nom.game);
            
            if (!searchResult?.games?.length) {
                // No results found, offer manual input
                return await this.handleManualInput(message, nom);
            }

            if (searchResult.games.length > 1) {
                // Multiple results found, let user choose
                return await this.handleMultipleResults(message, nom, searchResult.games);
            }

            return this.formatGameData(searchResult.games[0]);
        } catch (error) {
            console.error('Error processing game:', error);
            return await this.handleManualInput(message, nom);
        }
    },

    async handleMultipleResults(message, nom, games) {
        const choices = games.slice(0, 5).map((game, i) => 
            `${i + 1}. ${game.title} (${game.platforms?.[0]?.platform_name || 'Unknown Platform'})`
        ).join('\n');

        await message.channel.send(
            '```ansi\n\x1b[32mMultiple matches found for ' + nom.game + ':\n' +
            choices + '\n\n' +
            'Enter a number to select, "M" for manual input, or "S" to skip.\n' +
            '[Ready for input]█\x1b[0m```'
        );

        const filter = m => m.author.id === message.author.id;
        const response = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000
        });

        if (!response.size) return null;
        const choice = response.first().content.toLowerCase();

        if (choice === 'm') {
            return await this.handleManualInput(message, nom);
        }
        if (choice === 's') {
            return null;
        }

        const index = parseInt(choice) - 1;
        if (index >= 0 && index < games.length) {
            return this.formatGameData(games[index]);
        }
        return null;
    },

    async handleManualInput(message, nom) {
        await message.channel.send(
            '```ansi\n\x1b[32mEnter details for: ' + nom.game + '\n\n' +
            'Format: Description | Genre | Metacritic Score\n' +
            'Example: A classic RPG with turn-based combat | RPG | 85\n\n' +
            'You have 60 seconds to respond.\n' +
            'Type "skip" to skip this game.\n' +
            '[Ready for input]█\x1b[0m```'
        );

        const filter = m => m.author.id === message.author.id;
        const response = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 60000
        });

        if (!response.size || response.first().content.toLowerCase() === 'skip') {
            return null;
        }

        const [description, genre, score] = response.first().content.split('|').map(s => s.trim());
        return {
            title: nom.game,
            description: description || 'No description available.',
            genre: genre || 'Unknown Genre',
            mobyScore: score || '??'
        };
    },

    sanitizeDescription(text) {
        if (!text) return '';
        // Remove HTML tags
        text = text.replace(/<[^>]*>/g, '');
        // Remove multiple spaces
        text = text.replace(/\s+/g, ' ');
        // Remove special characters and normalize
        text = text.replace(/[^\w\s.,!?-]/g, '');
        // Trim whitespace
        return text.trim();
    },

    getRandomNominations(nominations, count) {
        const shuffled = [...nominations].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, nominations.length));
    },

    async generateGraphic(games, progressMsg, month) {
        const canvas = createCanvas(900, 1200);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#2C2C2C';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, canvas.width, 100);
        
        // Draw header text with proper spacing
        ctx.font = 'bold 48px Arial';
        const headerParts = [
            { text: month, color: '#FFFFFF', x: 20 },
            { text: 'RETRO CHALLENGE', color: '#FFFFFF', x: 220 },
            { text: 'NOMINEES', color: PURPLE, x: 650 }
        ];
        
        headerParts.forEach(part => {
            ctx.fillStyle = part.color;
            ctx.fillText(part.text, part.x, 60);
        });

        let yOffset = 120;

        for (const [index, game] of games.entries()) {
            const isYellow = index % 2 === 1;

            // Update progress
            await progressMsg.edit({
                embeds: [new TerminalEmbed()
                    .setTerminalTitle('GENERATING NOMINATION GRAPHIC')
                    .setTerminalDescription('[PROCESS RUNNING]')
                    .addTerminalField('STATUS', `Processing game ${index + 1}/${games.length}: ${game.title}`)
                    .setTerminalFooter()]
            });

            // Background
            ctx.fillStyle = isYellow ? YELLOW : PURPLE;
            ctx.fillRect(0, yOffset, canvas.width, SPACE_BETWEEN_GAMES - 20);

            // Box art
            if (game.sample_cover?.image) {
                try {
                    const boxArt = await loadImage(game.sample_cover.image);
                    const boxArtX = isYellow ? 20 : canvas.width - 170;
                    ctx.drawImage(boxArt, boxArtX, yOffset + 10, 150, 180);
                } catch (err) {
                    console.error('Error loading box art:', err);
                }
            }

            // Text position
            const textX = isYellow ? 190 : 20;
            const textWidth = canvas.width - 210;

            // Title (in purple for yellow backgrounds, white for purple backgrounds)
            ctx.font = 'bold 36px Arial';
            ctx.fillStyle = isYellow ? PURPLE : '#FFFFFF';
            ctx.fillText(game.title, textX, yOffset + 45);
            
            // Platform (in black for yellow backgrounds, white for purple backgrounds)
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = isYellow ? '#000000' : '#FFFFFF';
            ctx.fillText(`${game.platform} (Metacritic: ${game.mobyScore})`, textX, yOffset + 80);

            // Genre
            ctx.fillText(game.genre, textX, yOffset + 110);

            // Description
            let description = game.description;
            if (description.length > 300) {
                description = description.substring(0, 297) + '...';
            }

            ctx.font = '16px Arial';
            const wrappedDesc = this.wrapText(ctx, description, textWidth);
            let textY = yOffset + 140;
            wrappedDesc.forEach(line => {
                ctx.fillText(line, textX, textY);
                textY += 20;
            });

            yOffset += SPACE_BETWEEN_GAMES;
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
