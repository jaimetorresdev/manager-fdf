import { PrismaClient } from '@prisma/client';

// OBSOLETO: script manual de desarrollo. No se ejecuta desde seed/entrypoint ni debe
// usarse para reseed productivo; mantener solo como referencia histórica.
const prisma = new PrismaClient();

const FIRST_NAMES: Record<string, string[]> = {
  'España': ['Antonio', 'Manuel', 'Jose', 'Francisco', 'David', 'Juan', 'Javier', 'Carlos', 'Alejandro', 'Daniel', 'Pedro', 'Pablo'],
  'Brasil': ['Lucas', 'Mateus', 'Gabriel', 'Rafael', 'Pedro', 'Marcos', 'Thiago', 'Felipe', 'Joao', 'Marcelo'],
  'Argentina': ['Juan', 'Jose', 'Diego', 'Carlos', 'Luis', 'Facundo', 'Matias', 'Lautaro', 'Julian', 'Enzo'],
  'Francia': ['Jean', 'Pierre', 'Michel', 'Alain', 'Claude', 'Nicolas', 'Kylian', 'Antoine', 'Olivier', 'Hugo'],
  'Alemania': ['Thomas', 'Michael', 'Andreas', 'Peter', 'Daniel', 'Lukas', 'Leon', 'Joshua', 'Manuel', 'Florian'],
  'Portugal': ['Joao', 'Antonio', 'Francisco', 'Manuel', 'Jose', 'Cristiano', 'Bruno', 'Bernardo', 'Ruben', 'Diogo'],
  'Italia': ['Giuseppe', 'Giovanni', 'Antonio', 'Mario', 'Luigi', 'Francesco', 'Alessandro', 'Lorenzo', 'Federico', 'Marco'],
  'Inglaterra': ['John', 'David', 'Michael', 'James', 'William', 'Harry', 'Jack', 'Phil', 'Bukayo', 'Jude'],
  'Países Bajos': ['Johannes', 'Jan', 'Cornelis', 'Dirk', 'Hendrik', 'Frenkie', 'Virgil', 'Memphis', 'Cody', 'Matthijs'],
  'Uruguay': ['Jose', 'Luis', 'Juan', 'Carlos', 'Luis', 'Federico', 'Darwin', 'Ronald', 'Manuel', 'Facundo']
};

const LAST_NAMES: Record<string, string[]> = {
  'España': ['García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín'],
  'Brasil': ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes'],
  'Argentina': ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Álvarez'],
  'Francia': ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau'],
  'Alemania': ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann'],
  'Portugal': ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Jesus', 'Sousa'],
  'Italia': ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco'],
  'Inglaterra': ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright'],
  'Países Bajos': ['De Jong', 'Jansen', 'De Vries', 'Van den Berg', 'Van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'De Boer'],
  'Uruguay': ['Rodríguez', 'Gómez', 'González', 'Martínez', 'García', 'Fernández', 'López', 'Pérez', 'Silva', 'Díaz']
};

// A simple gaussian random generator
function gaussianRand(mean: number, stdev: number) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

function generateSquad(reputation: number, clubCountry: string) {
  // Max 30 players
  const size = Math.floor(Math.random() * 11) + 20; // 20 to 30
  
  const basePositions = [
    'PO', 'PO', 'PO', 'LD', 'LD', 'LI', 'LI', 'DFC', 'DFC', 'DFC', 'DFC',
    'PIV', 'PIV', 'MC', 'MC', 'MC', 'MCO', 'MCO', 'MD', 'MD', 'MI', 'MI',
    'EXT DERECHA', 'EXT IZQ', 'DC', 'DC', 'DC', 'DC', 'DFC', 'MC'
  ];
  
  const positions = basePositions.slice(0, size);
  
  const defaultNationalities = Object.keys(FIRST_NAMES);
  const defaultFlags = ['🇪🇸','🇧🇷','🇦🇷','🇫🇷','🇩🇪','🇵🇹','🇮🇹','🏴','🇳🇱','🇺🇾'];
  
  // Adjusted baseline: rep 95 -> base ~82
  const base = Math.round(reputation * 0.86);

  return positions.map((pos, i) => {
    let age = Math.round(gaussianRand(23.5, 3.5));
    if (age < 17) age = 17;
    if (age > 30) age = 30;

    let ageFactor = 0;
    if (age < 21) ageFactor = - (21 - age); 
    else if (age >= 25 && age <= 28) ageFactor = 2; // Prime

    const attrBaseRaw = gaussianRand(base + ageFactor, 4);
    const attrBase = Math.min(95, Math.max(30, Math.round(attrBaseRaw)));

    const isGK = pos === 'PO';
    
    const isNative = Math.random() < 0.7;
    let nationality = clubCountry;
    let flag = '🌍';
    let countryKey = clubCountry;
    
    const natIdx = defaultNationalities.indexOf(clubCountry);
    if (natIdx >= 0) flag = defaultFlags[natIdx];
    
    if (!isNative) {
       const ri = Math.floor(Math.random() * defaultNationalities.length);
       nationality = defaultNationalities[ri];
       flag = defaultFlags[ri];
       countryKey = nationality;
    }

    const firstNamesList = FIRST_NAMES[countryKey] || FIRST_NAMES['Inglaterra'];
    const lastNamesList = LAST_NAMES[countryKey] || LAST_NAMES['Inglaterra'];
    const firstName = firstNamesList[Math.floor(Math.random() * firstNamesList.length)];
    const lastName = lastNamesList[Math.floor(Math.random() * lastNamesList.length)];

    const talent = Math.max(1, Math.min(100, attrBase + Math.floor(Math.random() * 10)));
    const potential = Math.max(attrBase, Math.min(100, attrBase + Math.floor(Math.random() * (30 - age))));

    let shooting = isGK ? Math.max(5, attrBase - 40) : Math.max(10, attrBase + gaussianRand(0, 10));
    let passing = isGK ? Math.max(10, attrBase - 30) : Math.max(10, attrBase + gaussianRand(0, 10));
    const physical = Math.max(10, attrBase + gaussianRand(0, 10));
    let defending = isGK ? Math.max(10, attrBase - 30) : Math.max(10, attrBase + gaussianRand(0, 10));
    const goalkeeping = isGK ? attrBase : Math.max(1, 10 + Math.floor(Math.random() * 10));
    let speed = Math.max(10, attrBase + gaussianRand(0, 10));
    const dribbling = isGK ? Math.max(5, attrBase - 40) : Math.max(10, attrBase + gaussianRand(0, 10));

    if (pos === 'DC') shooting += 10;
    if (pos === 'MCO' || pos === 'MC') passing += 10;
    if (pos === 'DFC' || pos === 'PIV') defending += 10;
    if (pos === 'EXT DERECHA' || pos === 'EXT IZQ' || pos === 'MD' || pos === 'MI') speed += 10;

    const totalAttr = shooting + passing + physical + defending + speed + dribbling + goalkeeping;
    const avg = Math.round(totalAttr / 7);
    const overallRating = Math.min(99, Math.round(avg));

    return {
      name: `${firstName} ${lastName}`,
      age,
      nationality,
      flag,
      preferredFoot: Math.random() > 0.2 ? 'Right' : 'Left',
      position: pos,
      squadNumber: i + 1, // Guarantee unique
      talent,
      potential,
      condition: 100,
      matchSharpness: 80,
      happiness: 80,
      marketValue: overallRating * 1000000 * (1 + (30 - age)*0.05),
      salary: overallRating * 15000,
      isTransferListed: false,
      attributes: JSON.stringify({ shooting, passing, physical, defending, speed, dribbling, goalkeeping })
    };
  });
}

async function main() {
  console.log('Clearing existing players...');
  await prisma.playerMatchStat.deleteMany({});
  await prisma.playerSeasonStat.deleteMany({});
  await prisma.transferListing.deleteMany({});
  await prisma.player.deleteMany({});
  
  console.log('Fetching clubs...');
  const clubs = await prisma.club.findMany();

  for (const club of clubs) {
    const squad = generateSquad(club.reputation, club.country);
    await prisma.player.createMany({
      data: squad.map(p => ({ ...p, clubId: club.id })),
    });
    console.log(`Generated ${squad.length} players for ${club.name}`);
  }
  
  console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
