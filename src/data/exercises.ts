import type { Exercise, Metric, Tier } from '../types';

/**
 * Library rows are stored as pipe-delimited strings to keep this file readable
 * and diffable: name|primary|equipment|pattern|rest|metric|aliases
 * `metric` and `aliases` are optional; rest is in seconds.
 */
const METRICS: Record<string, Metric> = {
  w: 'weight_reps',
  r: 'reps',
  t: 'time',
  tw: 'time_weight',
  dt: 'distance_time',
};

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parse(tier: Tier, block: string): Exercise[] {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, primary, equipment, pattern, rest, metric, aliases] = line.split('|');
      return {
        id: slug(name),
        name,
        aliases: aliases ? aliases.split(',').map((a) => a.trim()) : [],
        primary,
        equipment,
        pattern,
        tier,
        metric: METRICS[metric ?? 'w'] ?? 'weight_reps',
        defaultRestSec: Number(rest) || 60,
        tags: [],
      } satisfies Exercise;
    });
}

/* ── Tier A: rehab / physical therapy ────────────────────────────────── */

const REHAB_KNEE = `
Quad Set|quads|bodyweight|activation|30|t|isometric quad
Short Arc Quad|quads|bodyweight|activation|30|r|SAQ
Straight Leg Raise|quads|bodyweight|activation|30|r|SLR
Terminal Knee Extension|quads|band|activation|45|r|TKE
Heel Slide|knee|bodyweight|mobility|30|r|
Prone Knee Hang|knee|bodyweight|mobility|30|t|
Seated Knee Flexion Stretch|knee|bodyweight|mobility|30|t|
Wall Slide Squat|quads|bodyweight|squat|60|r|
Mini Squat|quads|bodyweight|squat|45|r|
Sit-to-Stand|quads|bodyweight|squat|60|r|chair squat
Spanish Squat|quads|band|squat|60|t|
Wall Sit|quads|bodyweight|squat|60|t|
Low Box Step-Up|quads|bodyweight|lunge|60|r|
Eccentric Step-Down|quads|bodyweight|lunge|60|r|
Lateral Step-Up|quads|bodyweight|lunge|60|r|
Assisted Split Squat|quads|bodyweight|lunge|60|r|
Leg Press (Limited Range)|quads|machine|squat|90|w|
Seated Leg Extension (Limited ROM)|quads|machine|isolation|60|w|
Patellar Mobilization|knee|other|mobility|30|t|
Knee Extension Lag Drill|quads|bodyweight|activation|30|r|
`;

const REHAB_HIP = `
Glute Bridge|glutes|bodyweight|hinge|45|r|
Single-Leg Glute Bridge|glutes|bodyweight|hinge|60|r|
Marching Bridge|glutes|bodyweight|hinge|45|r|
Clamshell|glutes|band|activation|45|r|
Side-Lying Hip Abduction|glutes|bodyweight|activation|45|r|
Fire Hydrant|glutes|bodyweight|activation|45|r|
Donkey Kick|glutes|bodyweight|activation|45|r|
Standing Hip Abduction|glutes|band|activation|45|r|
Standing Hip Extension|glutes|band|activation|45|r|
Lateral Band Walk|glutes|band|gait|60|r|monster walk
Monster Walk|glutes|band|gait|60|r|
Hip Hike|glutes|bodyweight|activation|45|r|pelvic drop
Hip Airplane|glutes|bodyweight|balance|60|r|
Copenhagen Plank|adductors|bodyweight|core|60|t|
Adductor Ball Squeeze|adductors|ball|activation|45|t|
90/90 Hip Switch|hips|bodyweight|mobility|45|r|
Seated Hip Internal Rotation|hips|band|mobility|45|r|
Seated Hip External Rotation|hips|band|mobility|45|r|
Prone Hip Extension|glutes|bodyweight|activation|45|r|
Quadruped Hip Circle|hips|bodyweight|mobility|45|r|
`;

const REHAB_ANKLE = `
Ankle Pumps|calves|bodyweight|mobility|30|r|
Ankle Alphabet|ankle|bodyweight|mobility|30|t|
Ankle Dorsiflexion (Band)|ankle|band|activation|45|r|
Ankle Plantarflexion (Band)|ankle|band|activation|45|r|
Ankle Eversion (Band)|ankle|band|activation|45|r|
Ankle Inversion (Band)|ankle|band|activation|45|r|
Seated Calf Raise|calves|machine|isolation|60|w|
Standing Calf Raise|calves|bodyweight|isolation|60|r|
Single-Leg Heel Raise|calves|bodyweight|isolation|60|r|
Eccentric Heel Drop|calves|bodyweight|isolation|60|r|
Tibialis Raise|shins|bodyweight|isolation|45|r|
Heel Walk|shins|bodyweight|gait|45|t|
Toe Walk|calves|bodyweight|gait|45|t|
Towel Scrunch|foot|other|activation|30|r|
Marble Pickup|foot|other|activation|30|r|
Short Foot Exercise|foot|bodyweight|activation|30|t|arch doming
Knee-to-Wall Ankle Mobilization|ankle|bodyweight|mobility|30|r|
Calf Stretch (Gastroc)|calves|bodyweight|mobility|30|t|
Calf Stretch (Soleus)|calves|bodyweight|mobility|30|t|
`;

const REHAB_SHOULDER = `
Pendulum Swing|shoulders|bodyweight|mobility|30|t|codman
Wall Walk|shoulders|bodyweight|mobility|45|r|finger ladder
Cane-Assisted Shoulder Flexion|shoulders|other|mobility|45|r|AAROM flexion
Cane-Assisted External Rotation|shoulders|other|mobility|45|r|
Shoulder External Rotation (Band)|rotator cuff|band|activation|45|r|ER band
Shoulder Internal Rotation (Band)|rotator cuff|band|activation|45|r|IR band
Side-Lying External Rotation|rotator cuff|dumbbell|activation|45|w|
Full Can Raise|rotator cuff|dumbbell|activation|45|w|
Scapular Retraction|upper back|band|activation|45|r|scap squeeze
Scapular Push-Up|serratus|bodyweight|push-h|45|r|
Serratus Wall Slide|serratus|bodyweight|mobility|45|r|
Prone Y Raise|upper back|bodyweight|pull-h|45|r|
Prone T Raise|upper back|bodyweight|pull-h|45|r|
Prone W Raise|upper back|bodyweight|pull-h|45|r|
Prone I Raise|upper back|bodyweight|pull-h|45|r|
Sleeper Stretch|shoulders|bodyweight|mobility|30|t|
Cross-Body Shoulder Stretch|shoulders|bodyweight|mobility|30|t|
Rhythmic Stabilization|rotator cuff|bodyweight|activation|45|t|
Bodyblade Oscillation|shoulders|other|activation|45|t|
Wall Push-Up|chest|bodyweight|push-h|45|r|
Isometric Shoulder Abduction|shoulders|bodyweight|activation|45|t|
`;

const REHAB_SPINE = `
Pelvic Tilt|core|bodyweight|activation|30|r|
Transverse Abdominis Activation|core|bodyweight|activation|30|t|TA brace
Dead Bug|core|bodyweight|core|45|r|
Bird Dog|core|bodyweight|core|45|r|
Cat-Cow|spine|bodyweight|mobility|30|r|
Prone Press-Up|spine|bodyweight|mobility|30|r|mckenzie extension
Segmental Bridge|glutes|bodyweight|hinge|45|r|
Modified Curl-Up|core|bodyweight|core|45|r|mcgill curl up
Side Plank (Knees)|core|bodyweight|core|45|t|
Standing Row (Band)|upper back|band|pull-h|45|r|
Chin Tuck|neck|bodyweight|activation|30|r|cervical retraction
Cervical Isometric|neck|bodyweight|activation|30|t|
Thoracic Extension over Roller|spine|foam-roller|mobility|30|r|
Supine Lumbar Rotation|spine|bodyweight|mobility|30|t|
Prone Swimmer|upper back|bodyweight|pull-h|45|r|
Quadruped Rock Back|hips|bodyweight|mobility|30|r|
Standing Lumbar Extension|spine|bodyweight|mobility|30|r|
Knee-to-Chest Stretch|spine|bodyweight|mobility|30|t|
`;

const REHAB_ARM = `
Wrist Flexion Curl|forearms|dumbbell|isolation|45|w|
Wrist Extension Curl|forearms|dumbbell|isolation|45|w|
Radial Deviation|forearms|dumbbell|isolation|45|w|
Ulnar Deviation|forearms|dumbbell|isolation|45|w|
Forearm Pronation (Hammer)|forearms|other|isolation|45|r|
Forearm Supination (Hammer)|forearms|other|isolation|45|r|
Grip Ball Squeeze|forearms|ball|isolation|45|r|
Tendon Glides|hand|bodyweight|mobility|30|r|
Median Nerve Glide|hand|bodyweight|mobility|30|r|
Ulnar Nerve Glide|hand|bodyweight|mobility|30|r|
Radial Nerve Glide|hand|bodyweight|mobility|30|r|
Eccentric Wrist Extension|forearms|other|isolation|45|r|tyler twist
Elbow Flexion AAROM|biceps|bodyweight|mobility|30|r|
Elbow Extension AAROM|triceps|bodyweight|mobility|30|r|
Putty Pinch|hand|other|isolation|30|r|
`;

const REHAB_BALANCE = `
Single-Leg Stance|balance|bodyweight|balance|45|t|
Single-Leg Stance (Eyes Closed)|balance|bodyweight|balance|45|t|
Tandem Stance|balance|bodyweight|balance|45|t|
Tandem Walk|balance|bodyweight|gait|45|t|
Heel-to-Toe Walk|balance|bodyweight|gait|45|t|
BOSU Balance|balance|other|balance|45|t|
Wobble Board Balance|balance|other|balance|45|t|
Foam Pad Balance|balance|other|balance|45|t|
Y-Balance Reach|balance|bodyweight|balance|60|r|
Star Excursion Reach|balance|bodyweight|balance|60|r|
Single-Leg Reach|balance|bodyweight|balance|60|r|
Perturbation Training|balance|other|balance|60|t|
Lateral Hop and Stick|balance|bodyweight|balance|60|r|
Single-Leg Hop and Hold|balance|bodyweight|balance|60|r|
Gait Training (Treadmill)|gait|cardio|gait|60|dt|
`;

/* ── Tier B: strength ────────────────────────────────────────────────── */

const SQUAT = `
Barbell Back Squat|quads|barbell|squat|180|w|squat
Barbell Front Squat|quads|barbell|squat|180|w|
Goblet Squat|quads|dumbbell|squat|90|w|
Kettlebell Goblet Squat|quads|kettlebell|squat|90|w|
Heels-Elevated Goblet Squat|quads|dumbbell|squat|90|w|
Zercher Squat|quads|barbell|squat|180|w|
Box Squat|quads|barbell|squat|180|w|
Pause Squat|quads|barbell|squat|180|w|
Safety Bar Squat|quads|barbell|squat|180|w|SSB squat
Low Bar Squat|quads|barbell|squat|180|w|
High Bar Squat|quads|barbell|squat|180|w|
Overhead Squat|quads|barbell|squat|150|w|
Landmine Squat|quads|barbell|squat|90|w|
Smith Machine Squat|quads|smith|squat|120|w|
Hack Squat|quads|machine|squat|120|w|
Pendulum Squat|quads|machine|squat|120|w|
Belt Squat|quads|machine|squat|120|w|
Leg Press|quads|machine|squat|120|w|
Single-Leg Press|quads|machine|squat|90|w|
Sissy Squat|quads|bodyweight|squat|90|r|
Pistol Squat|quads|bodyweight|squat|90|r|
Cossack Squat|adductors|bodyweight|squat|60|r|
Cyclist Squat|quads|barbell|squat|150|w|
Bodyweight Squat|quads|bodyweight|squat|45|r|air squat
Jump Squat|quads|bodyweight|squat|90|r|
`;

const LUNGE = `
Walking Lunge|quads|dumbbell|lunge|90|r|
Reverse Lunge|quads|dumbbell|lunge|90|r|
Forward Lunge|quads|dumbbell|lunge|90|r|
Lateral Lunge|adductors|dumbbell|lunge|90|r|
Curtsy Lunge|glutes|dumbbell|lunge|90|r|
Deficit Reverse Lunge|quads|dumbbell|lunge|90|r|
Bulgarian Split Squat|quads|dumbbell|lunge|90|w|rear foot elevated split squat
Split Squat|quads|dumbbell|lunge|90|w|
Barbell Split Squat|quads|barbell|lunge|120|w|
Step-Up|quads|dumbbell|lunge|90|w|
High Box Step-Up|quads|dumbbell|lunge|90|w|
Lateral Step-Up (Loaded)|quads|dumbbell|lunge|90|w|
Smith Machine Split Squat|quads|smith|lunge|90|w|
Barbell Walking Lunge|quads|barbell|lunge|120|r|
Landmine Reverse Lunge|quads|barbell|lunge|90|w|
`;

const HINGE = `
Conventional Deadlift|hamstrings|barbell|hinge|210|w|deadlift
Sumo Deadlift|hamstrings|barbell|hinge|210|w|
Romanian Deadlift|hamstrings|barbell|hinge|150|w|RDL
Dumbbell Romanian Deadlift|hamstrings|dumbbell|hinge|120|w|
Single-Leg Romanian Deadlift|hamstrings|dumbbell|hinge|90|w|SLRDL
Stiff-Leg Deadlift|hamstrings|barbell|hinge|150|w|
Trap Bar Deadlift|hamstrings|trap-bar|hinge|180|w|hex bar deadlift
Deficit Deadlift|hamstrings|barbell|hinge|180|w|
Rack Pull|back|barbell|hinge|180|w|
Snatch-Grip Deadlift|back|barbell|hinge|180|w|
Good Morning|hamstrings|barbell|hinge|120|w|
Barbell Hip Thrust|glutes|barbell|hinge|120|w|hip thrust
Single-Leg Hip Thrust|glutes|bodyweight|hinge|90|r|
Machine Hip Thrust|glutes|machine|hinge|90|w|
Barbell Glute Bridge|glutes|barbell|hinge|90|w|
Cable Pull-Through|glutes|cable|hinge|75|w|
Kettlebell Swing|glutes|kettlebell|hinge|75|w|
Kettlebell Deadlift|hamstrings|kettlebell|hinge|90|w|
45-Degree Back Extension|lower back|machine|hinge|75|r|hyperextension
Reverse Hyperextension|lower back|machine|hinge|75|w|
Nordic Hamstring Curl|hamstrings|bodyweight|hinge|90|r|
Glute-Ham Raise|hamstrings|machine|hinge|90|r|GHR
Seated Leg Curl|hamstrings|machine|isolation|75|w|
Lying Leg Curl|hamstrings|machine|isolation|75|w|
Standing Leg Curl|hamstrings|machine|isolation|60|w|
Nordic Curl Negative|hamstrings|bodyweight|hinge|90|r|
Slider Leg Curl|hamstrings|other|hinge|60|r|
Stability Ball Leg Curl|hamstrings|ball|hinge|60|r|
`;

const PUSH_H = `
Barbell Bench Press|chest|barbell|push-h|180|w|bench press
Incline Barbell Bench Press|chest|barbell|push-h|150|w|
Decline Barbell Bench Press|chest|barbell|push-h|150|w|
Close-Grip Bench Press|triceps|barbell|push-h|150|w|
Dumbbell Bench Press|chest|dumbbell|push-h|120|w|
Incline Dumbbell Bench Press|chest|dumbbell|push-h|120|w|
Decline Dumbbell Bench Press|chest|dumbbell|push-h|120|w|
Neutral-Grip Dumbbell Press|chest|dumbbell|push-h|120|w|
Floor Press|chest|barbell|push-h|150|w|
Spoto Press|chest|barbell|push-h|150|w|
Board Press|chest|barbell|push-h|150|w|
Pin Press|chest|barbell|push-h|150|w|
Smith Machine Bench Press|chest|smith|push-h|120|w|
Machine Chest Press|chest|machine|push-h|90|w|
Incline Machine Press|chest|machine|push-h|90|w|
Push-Up|chest|bodyweight|push-h|60|r|
Incline Push-Up|chest|bodyweight|push-h|60|r|
Decline Push-Up|chest|bodyweight|push-h|60|r|
Diamond Push-Up|triceps|bodyweight|push-h|60|r|
Wide Push-Up|chest|bodyweight|push-h|60|r|
Deficit Push-Up|chest|bodyweight|push-h|60|r|
Archer Push-Up|chest|bodyweight|push-h|75|r|
Ring Push-Up|chest|other|push-h|75|r|
Weighted Push-Up|chest|plate|push-h|75|w|
Chest Dip|chest|bodyweight|push-h|120|r|
Weighted Chest Dip|chest|bodyweight|push-h|120|w|
Cable Fly (High to Low)|chest|cable|isolation|60|w|
Cable Fly (Mid)|chest|cable|isolation|60|w|
Cable Fly (Low to High)|chest|cable|isolation|60|w|
Dumbbell Fly|chest|dumbbell|isolation|60|w|
Incline Dumbbell Fly|chest|dumbbell|isolation|60|w|
Pec Deck|chest|machine|isolation|60|w|machine fly
Svend Press|chest|plate|isolation|45|w|
Landmine Press|shoulders|barbell|push-h|90|w|
Landmine Chest Press|chest|barbell|push-h|90|w|
`;

const PUSH_V = `
Overhead Press|shoulders|barbell|push-v|150|w|standing press,OHP
Seated Barbell Overhead Press|shoulders|barbell|push-v|120|w|
Push Press|shoulders|barbell|push-v|150|w|
Z-Press|shoulders|barbell|push-v|120|w|
Behind-the-Neck Press|shoulders|barbell|push-v|120|w|
Seated Dumbbell Shoulder Press|shoulders|dumbbell|push-v|120|w|
Standing Dumbbell Shoulder Press|shoulders|dumbbell|push-v|120|w|
Arnold Press|shoulders|dumbbell|push-v|120|w|
Machine Shoulder Press|shoulders|machine|push-v|90|w|
Smith Machine Shoulder Press|shoulders|smith|push-v|90|w|
Bradford Press|shoulders|barbell|push-v|90|w|
Pike Push-Up|shoulders|bodyweight|push-v|75|r|
Handstand Push-Up|shoulders|bodyweight|push-v|120|r|HSPU
Kettlebell Overhead Press|shoulders|kettlebell|push-v|90|w|
Half-Kneeling Landmine Press|shoulders|barbell|push-v|90|w|
Single-Arm Dumbbell Press|shoulders|dumbbell|push-v|90|w|
`;

const PULL_V = `
Pull-Up|lats|bodyweight|pull-v|150|r|
Chin-Up|lats|bodyweight|pull-v|150|r|
Neutral-Grip Pull-Up|lats|bodyweight|pull-v|150|r|
Wide-Grip Pull-Up|lats|bodyweight|pull-v|150|r|
Weighted Pull-Up|lats|bodyweight|pull-v|180|w|
Assisted Pull-Up|lats|machine|pull-v|120|w|
Band-Assisted Pull-Up|lats|band|pull-v|120|r|
Negative Pull-Up|lats|bodyweight|pull-v|120|r|
Lat Pulldown|lats|cable|pull-v|90|w|
Wide-Grip Lat Pulldown|lats|cable|pull-v|90|w|
Close-Grip Lat Pulldown|lats|cable|pull-v|90|w|
Neutral-Grip Lat Pulldown|lats|cable|pull-v|90|w|
Single-Arm Lat Pulldown|lats|cable|pull-v|75|w|
Kneeling Cable Pulldown|lats|cable|pull-v|75|w|
Straight-Arm Pulldown|lats|cable|isolation|60|w|
Machine Pulldown|lats|machine|pull-v|90|w|
Rope Lat Pullover|lats|cable|isolation|60|w|
Dumbbell Pullover|lats|dumbbell|isolation|75|w|
`;

const PULL_H = `
Barbell Row|upper back|barbell|pull-h|120|w|bent over row
Pendlay Row|upper back|barbell|pull-h|120|w|
Yates Row|upper back|barbell|pull-h|120|w|
Underhand Barbell Row|lats|barbell|pull-h|120|w|
T-Bar Row|upper back|barbell|pull-h|120|w|
Chest-Supported Row|upper back|dumbbell|pull-h|90|w|
Seal Row|upper back|barbell|pull-h|90|w|
Dumbbell Row|lats|dumbbell|pull-h|90|w|single arm row
Meadows Row|lats|barbell|pull-h|90|w|
Landmine Row|upper back|barbell|pull-h|90|w|
Seated Cable Row|upper back|cable|pull-h|90|w|
Wide-Grip Seated Row|upper back|cable|pull-h|90|w|
Single-Arm Cable Row|lats|cable|pull-h|75|w|
Machine Row|upper back|machine|pull-h|90|w|
Hammer Strength Row|upper back|machine|pull-h|90|w|
Inverted Row|upper back|bodyweight|pull-h|75|r|
Ring Row|upper back|other|pull-h|75|r|
Face Pull|rear delts|cable|pull-h|60|w|
Band Pull-Apart|rear delts|band|pull-h|45|r|
Reverse Pec Deck|rear delts|machine|isolation|60|w|
Dumbbell Rear Delt Fly|rear delts|dumbbell|isolation|60|w|
Cable Rear Delt Fly|rear delts|cable|isolation|60|w|
Barbell Shrug|traps|barbell|isolation|75|w|
Dumbbell Shrug|traps|dumbbell|isolation|75|w|
Trap Bar Shrug|traps|trap-bar|isolation|75|w|
Cable Shrug|traps|cable|isolation|60|w|
`;

const SHOULDER_ISO = `
Dumbbell Lateral Raise|side delts|dumbbell|isolation|60|w|lat raise
Cable Lateral Raise|side delts|cable|isolation|60|w|
Machine Lateral Raise|side delts|machine|isolation|60|w|
Leaning Lateral Raise|side delts|dumbbell|isolation|60|w|
Lu Raise|side delts|dumbbell|isolation|60|w|
Dumbbell Front Raise|front delts|dumbbell|isolation|60|w|
Plate Front Raise|front delts|plate|isolation|60|w|
Cable Front Raise|front delts|cable|isolation|60|w|
Barbell Upright Row|traps|barbell|pull-v|75|w|
Cable Upright Row|traps|cable|pull-v|60|w|
Cuban Press|rotator cuff|dumbbell|push-v|75|w|
Y-Raise|upper back|dumbbell|isolation|60|w|
Incline Rear Delt Raise|rear delts|dumbbell|isolation|60|w|
`;

const ARMS = `
Barbell Curl|biceps|barbell|isolation|75|w|
EZ-Bar Curl|biceps|ez-bar|isolation|75|w|
Dumbbell Curl|biceps|dumbbell|isolation|60|w|
Alternating Dumbbell Curl|biceps|dumbbell|isolation|60|w|
Hammer Curl|biceps|dumbbell|isolation|60|w|
Incline Dumbbell Curl|biceps|dumbbell|isolation|60|w|
Preacher Curl|biceps|ez-bar|isolation|60|w|
Machine Preacher Curl|biceps|machine|isolation|60|w|
Concentration Curl|biceps|dumbbell|isolation|60|w|
Spider Curl|biceps|dumbbell|isolation|60|w|
Cable Curl|biceps|cable|isolation|60|w|
Bayesian Cable Curl|biceps|cable|isolation|60|w|
Drag Curl|biceps|barbell|isolation|60|w|
Zottman Curl|biceps|dumbbell|isolation|60|w|
Reverse Curl|forearms|barbell|isolation|60|w|
Cross-Body Hammer Curl|biceps|dumbbell|isolation|60|w|
Skullcrusher|triceps|ez-bar|isolation|75|w|lying triceps extension
Dumbbell Skullcrusher|triceps|dumbbell|isolation|60|w|
JM Press|triceps|barbell|push-h|90|w|
Tate Press|triceps|dumbbell|isolation|60|w|
Overhead Cable Extension|triceps|cable|isolation|60|w|
Overhead Dumbbell Extension|triceps|dumbbell|isolation|60|w|
Rope Pushdown|triceps|cable|isolation|60|w|
Bar Pushdown|triceps|cable|isolation|60|w|
V-Bar Pushdown|triceps|cable|isolation|60|w|
Single-Arm Pushdown|triceps|cable|isolation|60|w|
Triceps Kickback|triceps|dumbbell|isolation|60|w|
Bench Dip|triceps|bodyweight|push-h|75|r|
Close-Grip Push-Up|triceps|bodyweight|push-h|60|r|
Barbell Wrist Curl|forearms|barbell|isolation|45|w|
Reverse Wrist Curl|forearms|barbell|isolation|45|w|
Wrist Roller|forearms|other|isolation|60|t|
Plate Pinch Hold|forearms|plate|carry|60|t|
Dead Hang|forearms|bodyweight|carry|60|t|
Farmer's Carry|forearms|dumbbell|carry|90|tw|
`;

const CORE = `
Plank|core|bodyweight|core|45|t|
RKC Plank|core|bodyweight|core|45|t|
Side Plank|obliques|bodyweight|core|45|t|
Long-Lever Plank|core|bodyweight|core|45|t|
Ab Wheel Rollout|core|other|core|75|r|
Barbell Rollout|core|barbell|core|75|r|
Hanging Leg Raise|core|bodyweight|core|75|r|
Hanging Knee Raise|core|bodyweight|core|60|r|
Captain's Chair Knee Raise|core|machine|core|60|r|
Toes-to-Bar|core|bodyweight|core|75|r|
Cable Crunch|core|cable|core|60|w|
Machine Crunch|core|machine|core|60|w|
Crunch|core|bodyweight|core|45|r|
Sit-Up|core|bodyweight|core|45|r|
Decline Sit-Up|core|bodyweight|core|60|r|
V-Up|core|bodyweight|core|60|r|
Hollow Body Hold|core|bodyweight|core|60|t|
L-Sit|core|bodyweight|core|75|t|
Dragon Flag|core|bodyweight|core|90|r|
Bicycle Crunch|obliques|bodyweight|core|45|r|
Russian Twist|obliques|plate|rotation|45|r|
Pallof Press|obliques|cable|rotation|60|w|
Half-Kneeling Pallof Press|obliques|cable|rotation|60|w|
Landmine Twist|obliques|barbell|rotation|60|w|
Cable Wood Chop|obliques|cable|rotation|60|w|
Reverse Wood Chop|obliques|cable|rotation|60|w|
Mountain Climber|core|bodyweight|core|45|t|
Suitcase Carry|obliques|dumbbell|carry|75|tw|
Turkish Get-Up|core|kettlebell|core|120|w|
Stir the Pot|core|ball|core|60|t|
Side Bend|obliques|dumbbell|isolation|45|w|
Weighted Plank|core|plate|core|60|tw|
`;

const OLY = `
Power Clean|full body|barbell|hinge|180|w|
Hang Power Clean|full body|barbell|hinge|180|w|
Clean|full body|barbell|hinge|210|w|
Clean and Jerk|full body|barbell|push-v|210|w|
Power Snatch|full body|barbell|hinge|180|w|
Snatch|full body|barbell|hinge|210|w|
Hang Snatch|full body|barbell|hinge|180|w|
Clean Pull|full body|barbell|hinge|180|w|
Snatch Pull|full body|barbell|hinge|180|w|
Barbell High Pull|traps|barbell|pull-v|120|w|
Push Jerk|shoulders|barbell|push-v|180|w|
Split Jerk|shoulders|barbell|push-v|180|w|
Thruster|full body|barbell|push-v|150|w|
Kettlebell Snatch|full body|kettlebell|hinge|90|w|
Kettlebell Clean|full body|kettlebell|hinge|90|w|
Medicine Ball Slam|full body|ball|core|60|r|
Medicine Ball Chest Pass|chest|ball|push-h|60|r|
Rotational Med Ball Throw|obliques|ball|rotation|60|r|
Box Jump|quads|box|squat|90|r|
Broad Jump|quads|bodyweight|squat|90|r|
Depth Jump|quads|box|squat|120|r|
Lateral Bound|glutes|bodyweight|balance|90|r|
Pogo Hop|calves|bodyweight|balance|60|r|
`;

/* ── Tier C: conditioning + mobility ─────────────────────────────────── */

const CONDITIONING = `
Treadmill Walk|cardio|cardio|cardio|60|dt|
Treadmill Incline Walk|cardio|cardio|cardio|60|dt|
Treadmill Run|cardio|cardio|cardio|60|dt|
Rowing Machine|cardio|cardio|cardio|60|dt|erg
Assault Bike|cardio|cardio|cardio|60|dt|air bike
Stationary Bike|cardio|cardio|cardio|60|dt|
Recumbent Bike|cardio|cardio|cardio|60|dt|
Elliptical|cardio|cardio|cardio|60|dt|
Stair Climber|cardio|cardio|cardio|60|dt|
SkiErg|cardio|cardio|cardio|60|dt|
Jump Rope|calves|other|cardio|45|t|
Sled Push|quads|sled|gait|90|dt|
Sled Pull|hamstrings|sled|gait|90|dt|
Sled Drag (Backward)|quads|sled|gait|90|dt|
Battle Ropes|shoulders|other|cardio|60|t|
Burpee|full body|bodyweight|cardio|60|r|
Shuttle Run|cardio|bodyweight|cardio|90|r|
Swimming|cardio|other|cardio|60|dt|
Ruck Walk|cardio|other|carry|60|dt|
Nordic Walking|cardio|other|gait|60|dt|
Aquatic Walking|cardio|other|gait|60|t|pool walking
Upper Body Ergometer|cardio|cardio|cardio|60|dt|UBE arm bike
`;

const MOBILITY = `
Couch Stretch|hip flexors|bodyweight|mobility|30|t|
Kneeling Hip Flexor Stretch|hip flexors|bodyweight|mobility|30|t|
Pigeon Pose|glutes|bodyweight|mobility|30|t|
Figure-4 Stretch|glutes|bodyweight|mobility|30|t|
Seated Hamstring Stretch|hamstrings|bodyweight|mobility|30|t|
Standing Hamstring Stretch|hamstrings|bodyweight|mobility|30|t|
Supine Hamstring Stretch (Strap)|hamstrings|band|mobility|30|t|
Standing Quad Stretch|quads|bodyweight|mobility|30|t|
Butterfly Stretch|adductors|bodyweight|mobility|30|t|
Frog Stretch|adductors|bodyweight|mobility|30|t|
90/90 Stretch|hips|bodyweight|mobility|30|t|
World's Greatest Stretch|hips|bodyweight|mobility|30|r|
Thread the Needle|spine|bodyweight|mobility|30|r|
Open Book Rotation|spine|bodyweight|mobility|30|r|
Child's Pose|spine|bodyweight|mobility|30|t|
Downward Dog|hamstrings|bodyweight|mobility|30|t|
Cobra Stretch|spine|bodyweight|mobility|30|t|
Wall Angel|shoulders|bodyweight|mobility|45|r|
Doorway Pec Stretch|chest|bodyweight|mobility|30|t|
Lat Stretch (Bar Hang)|lats|bodyweight|mobility|30|t|
Triceps Overhead Stretch|triceps|bodyweight|mobility|30|t|
Neck Side Bend Stretch|neck|bodyweight|mobility|30|t|
Levator Scapulae Stretch|neck|bodyweight|mobility|30|t|
Deep Squat Hold|hips|bodyweight|mobility|45|t|
Ankle Rocker Stretch|ankle|bodyweight|mobility|30|r|
Foam Roll Quads|quads|foam-roller|mobility|30|t|
Foam Roll IT Band|hips|foam-roller|mobility|30|t|
Foam Roll Hamstrings|hamstrings|foam-roller|mobility|30|t|
Foam Roll Calves|calves|foam-roller|mobility|30|t|
Foam Roll Thoracic Spine|spine|foam-roller|mobility|30|t|
Foam Roll Lats|lats|foam-roller|mobility|30|t|
Foam Roll Glutes|glutes|foam-roller|mobility|30|t|
Lacrosse Ball Release|other|ball|mobility|30|t|
Banded Hip Distraction|hips|band|mobility|30|t|
Banded Shoulder Distraction|shoulders|band|mobility|30|t|
`;

export const EXERCISES: Exercise[] = [
  ...parse('rehab', REHAB_KNEE),
  ...parse('rehab', REHAB_HIP),
  ...parse('rehab', REHAB_ANKLE),
  ...parse('rehab', REHAB_SHOULDER),
  ...parse('rehab', REHAB_SPINE),
  ...parse('rehab', REHAB_ARM),
  ...parse('rehab', REHAB_BALANCE),
  ...parse('strength', SQUAT),
  ...parse('strength', LUNGE),
  ...parse('strength', HINGE),
  ...parse('strength', PUSH_H),
  ...parse('strength', PUSH_V),
  ...parse('strength', PULL_V),
  ...parse('strength', PULL_H),
  ...parse('strength', SHOULDER_ISO),
  ...parse('strength', ARMS),
  ...parse('strength', CORE),
  ...parse('strength', OLY),
  ...parse('conditioning', CONDITIONING),
  ...parse('mobility', MOBILITY),
];

export const MUSCLE_GROUPS = Array.from(new Set(EXERCISES.map((e) => e.primary))).sort();
export const EQUIPMENT_TYPES = Array.from(new Set(EXERCISES.map((e) => e.equipment))).sort();

export const TIER_LABELS: Record<Tier, string> = {
  rehab: 'Rehab / PT',
  strength: 'Strength',
  general: 'General',
  mobility: 'Mobility',
  conditioning: 'Conditioning',
};

export function buildExerciseIndex(custom: Exercise[]): Map<string, Exercise> {
  const map = new Map<string, Exercise>();
  for (const ex of EXERCISES) map.set(ex.id, ex);
  for (const ex of custom) map.set(ex.id, ex);
  return map;
}

export function makeCustomExercise(input: {
  name: string;
  primary: string;
  equipment: string;
  metric: Metric;
  defaultRestSec: number;
}): Exercise {
  return {
    id: `custom-${slug(input.name)}-${Date.now().toString(36)}`,
    name: input.name,
    aliases: [],
    primary: input.primary,
    equipment: input.equipment,
    pattern: 'other',
    tier: 'rehab',
    metric: input.metric,
    defaultRestSec: input.defaultRestSec,
    tags: ['custom'],
    custom: true,
  };
}

/** Ranked search across name, aliases, muscle and equipment. */
export function searchExercises(
  all: Exercise[],
  query: string,
  filters: { tier?: Tier | 'all'; primary?: string; equipment?: string } = {},
): Exercise[] {
  const q = query.trim().toLowerCase();
  const scored: Array<{ ex: Exercise; score: number }> = [];

  for (const ex of all) {
    if (filters.tier && filters.tier !== 'all' && ex.tier !== filters.tier) continue;
    if (filters.primary && filters.primary !== 'all' && ex.primary !== filters.primary) continue;
    if (filters.equipment && filters.equipment !== 'all' && ex.equipment !== filters.equipment) continue;

    if (!q) {
      scored.push({ ex, score: 0 });
      continue;
    }

    const name = ex.name.toLowerCase();
    let score = -1;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (ex.aliases.some((a) => a.toLowerCase().includes(q))) score = 50;
    else if (ex.primary.includes(q)) score = 30;
    else if (ex.equipment.includes(q)) score = 20;

    if (score >= 0) scored.push({ ex, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name))
    .map((s) => s.ex);
}
