# Discussion: Rethinking Music Notation

> User-visible transcript. System, developer, tool, and other hidden
> context are excluded.

------------------------------------------------------------------------

## User

I want to discuss with you the written form of the music the music
sheet.

The expression of five lines is commonly used. However do you think it
is a "good" way of representing music? What is good and what is bad?

------------------------------------------------------------------------

## Assistant

Yes. The **five-line staff** is remarkably good---but it is good at
representing *some dimensions of music* and surprisingly poor at
representing others.

The key distinction I would make is this:

> A musical score is not music itself. It is an **encoding** of selected
> information about music.

And every encoding makes trade-offs.

### What the five-line staff does extremely well

Its greatest strength is **pitch relationships**. Vertical position maps
naturally to high and low pitch: move upward on the page, and generally
the sound moves upward. Once you learn the mapping, a melody acquires a
visible *shape*. A musician can glance at a passage and recognize rising
scales, repeated notes, leaps, chords, and melodic contours without
decoding every note individually.

It is also remarkably economical. Consider how much information
something like

**note position + note shape + clef + key signature + time signature**

can encode. With a small number of symbols, Western notation represents
pitch, approximate duration, simultaneity, meter, key, articulation,
dynamics, phrasing, and even performance instructions. And because time
progresses horizontally, several musicians' parts can be vertically
aligned. You can literally *see* that the violin plays this note while
the cello plays those notes.

That makes the staff particularly powerful for **polyphonic music**. A
piano score, quartet, or orchestral score becomes a kind of
two-dimensional map:

**horizontal axis → time**\
**vertical axis → pitch**

This is an excellent basic coordinate system.

### But it has some strange weaknesses

The first is that **time isn't actually represented proportionally**.

A half note lasts twice as long as a quarter note, but it normally isn't
drawn twice as wide. Duration is represented symbolically rather than
spatially. So the horizontal axis *sort of* means time, but not
consistently.

Pitch has a similar problem. The vertical axis looks continuous, but the
staff is really based on the seven-note diatonic system. C--D and E--F
occupy the same graphical distance even though their pitch intervals
differ. Sharps and flats then modify the underlying grid.

So geometrically, ordinary notation is rather peculiar:

> equal graphical distance ≠ equal frequency distance\
> equal horizontal distance ≠ equal time distance

Yet musicians learn to read through these inconsistencies extremely
efficiently.

There are deeper limitations too. Timbre is poorly represented. A violin
note and flute note may have identical notation even though acoustically
they are radically different sounds. Subtle timing---swing, groove,
rubato, microtiming---is difficult to capture. Continuous pitch bends
and non-Western tuning systems are awkward. Dynamics such as *p* and *f*
describe broad intentions rather than precise amplitudes. And something
as complicated as the attack and evolution of a sound may simply be
reduced to one dot on a line.

So if you gave a score to a machine with no prior knowledge of musical
performance, the score would often be **insufficient to reconstruct the
music**.

### There is also an important asymmetry

Staff notation is exceptionally good for answering:

**"What notes should a musician play?"**

It is much less good for answering:

**"What does this music actually sound like?"**

Those are different problems.

A waveform is almost the opposite. A digital audio waveform can
reproduce the sound extraordinarily accurately, but looking at it tells
a human musician very little about harmony, melody, or structure.

A spectrogram sits somewhere between the two: it represents frequency
against time and can show harmonics and timbral structure, but it is
cumbersome as a set of performance instructions.

So we could compare them conceptually:

  ------------------------------------------------------------------------------------
  Representation   Pitch          Rhythm      Timbre      Musical          Easy to
                                                          structure        perform
                                                                           from
  ---------------- -------------- ----------- ----------- ---------------- -----------
  Five-line score  Excellent      Excellent   Weak        Excellent        Excellent

  Piano roll       Very good      Very good   Weak        Good             Moderate

  Spectrogram      Precise        Precise     Excellent   Poor--moderate   Poor

  Waveform         Implicit       Precise     Encoded     Very poor        Very poor

  Audio recording  Complete       Complete    Complete    Implicit         Not really
                   perceptually                                            
  ------------------------------------------------------------------------------------

This reveals something quite profound about notation.

The five-line staff isn't primarily a **representation of sound**. It is
a representation of **musically meaningful actions and relationships**.

And that is probably why it has survived for so long.

It throws away enormous amounts of acoustic information---but much of
what it throws away isn't what a composer needs to communicate. Instead,
it preserves abstractions such as "this is a G," "hold it for two
beats," "these four notes form a chord," and "this voice enters here."

In information-theory language, you might almost think of it as an
extraordinarily effective **lossy compression format for musical
intention**.

And that raises what I think is the really interesting question behind
yours: **if we were inventing musical notation today from scratch, with
no obligation to preserve the five-line staff, would we invent anything
remotely similar?**

I suspect the answer would be *partly yes*. A two-dimensional
pitch-versus-time representation is extraordinarily natural. But I doubt
we would independently invent exactly five lines, seven diatonic note
names, clefs, key signatures, accidentals, and symbolic rather than
spatial duration. Those features contain a great deal of historical
baggage.

If you'd like, we could take the next step and **design a musical
notation system from scratch**, asking what an ideal representation
should optimize for---reading, composing, learning, mathematical
consistency, or accurately representing sound.

------------------------------------------------------------------------

## User

Let's don't eager to design a notation system but discuss it more. I
acknowledge your point and I think two of the conventions bothers me: 1.
The rhythmic notation is unnecessarily complicated and there are also
many symbols for one thing. 2. The pitch system is only natural for C
major scale. Any other scale would use excessive sharp and flat symbols.
And the alt symbols also make understanding the attribute of interval
and chord hard for beginners. It must be mapped into a uniform 12 equal
temperament before identifying the attribute. The uniformity of equal
temperament is degraded by the pitch notation.

Let's first focus on the issue #2. How can we do better for the pitch
notation

------------------------------------------------------------------------

## Assistant

I think your criticism identifies a deep tension in conventional pitch
notation. It is simultaneously representing **two different
structures**:

1.  a seven-element *diatonic* structure: A B C D E F G;
2.  a twelve-element *chromatic* structure: the 12 pitch classes of
    equal temperament.

The staff gives the first structure privileged status and represents the
second through modifications (`♯`, `♭`, `♮`). If our conceptual starting
point is 12-TET, that's an asymmetric representation.

Consider the chromatic scale:

`C  C♯  D  D♯  E  F  F♯  G  G♯  A  A♯  B`

Numerically, acoustically (in log-frequency), the underlying structure
is beautifully regular:

`0  1  2  3  4  5  6  7  8  9  10  11`

Every step means exactly one semitone. Conventional notation
deliberately hides that regularity.

But there's an important reason it does so.

### The accidental isn't merely an inconvenient way of saying "+1"

Suppose we have the notes:

`C – E♭ – G`

and

`C – D♯ – G`

Under 12-TET, E♭ and D♯ are the **same pitch class**: both are 3
semitones above C.

Yet the spellings communicate different structural interpretations.

`C–E♭` says **minor third**.\
`C–D♯` says **augmented second**.

Likewise:

`C E♭ G` → C minor triad

whereas

`C D♯ G`

is not conventionally understood as a properly spelled C minor triad,
even though a piano produces exactly the same frequencies.

So I would slightly reverse one part of your argument. You say:

> It must be mapped into a uniform 12 equal temperament before
> identifying the attribute.

That's true if by "attribute" we mean **semitone distance**. But
traditional theory often wants something else: *diatonic function plus
chromatic alteration*.

In fact, the notation intentionally prevents the mapping

`E♭ → 3`

from being the whole story.

It preserves something that 12-TET alone has erased.

### There are therefore two notions of "interval"

Take C → F♯.

Chromatic representation gives:

`0 → 6`

So the interval is simply **6 semitones**.

Traditional notation gives us two pieces of information:

`C → F` = some kind of fourth\
`F → F♯` = raise it one semitone

therefore **augmented fourth**.

Now compare C → G♭. It is also 6 semitones, but the letter distance
tells us it is some kind of fifth, hence **diminished fifth**.

From a 12-TET perspective this looks absurd:

`C→F♯ = 6`\
`C→G♭ = 6`

Why give identical pitch relationships different names?

Because tonal music sometimes cares about how a pitch got there and
where it is going. For example, an F♯ might function as a raised fourth
tending toward G, while G♭ might function as a lowered fifth tending
toward F. The notation encodes **grammatical interpretation**, not
merely acoustic position.

So we have found our first design trade-off:

> **Pitch-class uniformity and tonal spelling are competing goals.**

### One obvious improvement: make 12 pitch classes primary

We could imagine a notation where every semitone has equal graphical
status.

For example:

  Pitch class     Number
  ------------- --------
  C                    0
  C♯/D♭                1
  D                    2
  D♯/E♭                3
  E                    4
  F                    5
  F♯/G♭                6
  G                    7
  G♯/A♭                8
  A                    9
  A♯/B♭               10
  B                   11

Then transposition becomes wonderfully simple.

A C-major triad is

`0  4  7`

and a D-major triad is just

`2  6  9`.

More generally a major triad rooted at `x` is

`x, x+4, x+7   (mod 12)`.

A minor triad is always

`x, x+3, x+7`.

Now chord recognition becomes almost geometric/arithmetic. We no longer
need the beginner to reason:

> C→E is a third, count C-D-E; now determine whether that third is
> major...

They can see directly that the distance is 4 semitones.

That directly addresses your objection. **Intervals become
translation-invariant.** The same interval has the same representation
everywhere.

And I think this is a genuinely strong property that conventional
notation lacks.

### But we've paid for it

Now consider a G-major scale.

Traditional notation:

`G A B C D E F♯ G`

The structure is visually/conceptually very clean: seven consecutive
letter names, with one alteration.

Our chromatic notation gives:

`7 9 11 0 2 4 6 7`

or, relative to G,

`0 2 4 5 7 9 11 0`.

The latter is actually quite beautiful mathematically---but we've lost
something important: **scale degree identity**.

In tonal music, the fact that F♯ is degree 7 of G major matters
enormously. The traditional notation gives each scale degree its own
"slot." That is why G major doesn't really feel irregular to an
experienced staff reader: every scale degree still occupies the expected
consecutive staff position, and the key signature says that every F
position means F♯.

So I wouldn't characterize conventional notation simply as "C major
notation." There is something subtler going on.

It is really **diatonic-scale notation**.

The seven staff positions represent seven diatonic identities. The key
signature then defines how those identities map onto the twelve
chromatic pitches.

That is why G major remains easy to read once the key signature is
internalized:

`G A B C D E F G`

rather than mentally:

`G A B C D E F♯ G`.

The reader effectively changes the meaning of the F position.

### This suggests three fundamentally different approaches

Rather than designing one yet, I think it's useful to identify the
possibilities.

**A. Diatonic-primary notation --- conventional staff**

The primitive concept is:

`scale degree / letter + alteration`

So F♯ is conceptually something like:

`F + 1`.

Advantages: tonal function, voice leading, chord spelling and diatonic
structure are explicit.

Disadvantage: the 12-TET geometry is obscured.

**B. Chromatic-primary notation**

The primitive concept is:

`pitch class 0...11`.

Advantages: every semitone is equal; intervals and transposition become
trivial; enharmonic confusion disappears.

Disadvantage: F♯ and G♭ become indistinguishable, so some
harmonic/function information disappears.

**C. Two-dimensional/hybrid representation**

And this is where I think the discussion becomes especially interesting.

Maybe pitch really has **two independent attributes** that deserve
representation:

**chromatic position:** `0...11`

and

**tonal/diatonic role:** `1...7` relative to some context.

Conventional notation tries to squeeze both into one symbol. `F♯`
simultaneously says "the chromatic pitch 6" and "an altered F."

Perhaps *that* is the underlying source of the complexity you're
noticing.

If we're evaluating notation rather than rushing to invent a
replacement, I would therefore ask a very specific question next:

**Is enharmonic distinction---F♯ versus G♭---actually valuable
information that the written pitch should preserve, or is it theoretical
baggage that we'd be better off deriving from musical context?**

The answer to that determines whether a truly uniform 12-pitch notation
is an improvement or whether it destroys something essential.

------------------------------------------------------------------------

## User

> Selected text:
>
> In fact, the notation intentionally prevents the mapping\
> E♭ → 3\
> from being the whole story.

how about we represent the notes with text and line and represent the
duration by the length of the lines just like piano roll. and we use
extra annotations like arrows and plain text to add extra information to
the sheet? tbh, I know many people, even advanced level ones, only read
the music sheet by pure notes without noticing the tonal meaning. in the
proposed form, it keeps pitch and rythm info plain to the beginner and
make the internal structure explicit. how will you comment it? what are
the good parts and bad parts?

------------------------------------------------------------------------

## Assistant

Yes---I think this is a much stronger proposal than merely replacing
note names with numbers. You're proposing a **separation of layers**:

> **Base notation:** objectively say *what pitch happens when and for
> how long*.\
> **Annotation:** say *what those events mean musically*.

That separation deserves serious consideration.

Suppose the horizontal axis is literal time, line length is literal
duration, and the vertical/text representation uses all 12 pitches
uniformly. Something conceptually like:

``` text
11 B  ─────────
10 A#       ───────
 9 A
 8 G#
 7 G  ─────────────────
 6 F#
 5 F
 4 E  ─────────
 3 D#
 2 D
 1 C#
 0 C  ─────────────────────
     1   2   3   4   5   6   time →
```

Then annotations could sit above it:

``` text
             C minor
          root   m3    P5
            │     │     │
            ↓     ↓     ↓

G  ─────────────────────────
D#
C  ─────────────────────────
```

Or arrows could communicate voice-leading:

``` text
6 F# ──────── ↗
7 G           ────────
               ↑
          leading motion
```

The important conceptual change is that **analysis no longer
contaminates the representation of the musical event itself**.

## What I particularly like about it

The biggest advantage is **invariance**.

If a perfect fifth means seven semitones, it always occupies seven pitch
steps. A major third always occupies four. Transposing an entire passage
by three semitones literally means shifting everything by three
positions.

That's an extremely powerful property.

Traditional notation does not have it. Compare:

``` text
C → E      major 3rd
D → F#     major 3rd
Eb → G     major 3rd
F# → A#    major 3rd
```

The beginner has to learn that visually and symbolically different
constructions instantiate the same underlying interval.

In your representation:

``` text
0 → 4
2 → 6
3 → 7
6 → 10
```

all have the immediately visible invariant:

``` text
difference = 4
```

So concepts such as chord quality could emerge naturally from the
representation rather than requiring a parallel decoding system.

A major triad becomes the shape

``` text
root
 +4  ─── third
 +7  ─── fifth
```

wherever you put it.

That's pedagogically attractive.

### And your observation about advanced musicians matters

You're pointing toward an interesting distinction between **information
contained in a notation** and **information actually used while reading
it**.

Traditional notation might encode the distinction between, say, D♯ and
E♭, but that doesn't mean a performer consciously thinks:

> "Ah, this is the minor third of C, spelled E-flat."

during sight-reading.

Much expert reading is pattern recognition and motor prediction. So
requiring every note to carry harmonic spelling might indeed be making
the **lowest-level representation more complicated in order to preserve
information that belongs at a higher analytical level**.

Your proposal says: don't throw that information away---move it.

That's important.

Instead of

``` text
E♭
```

silently encoding several things at once, we could have something
equivalent to:

``` text
pitch: 3

annotation:
minor 3rd of C
↓
3
```

A beginner can ignore the annotation and still play correctly. A student
studying harmony can turn attention to it.

That resembles good information-system design: **progressive
disclosure**.

## Literal duration is another major benefit

Combining this pitch idea with piano-roll-like duration makes the
representation internally consistent:

``` text
vertical distance   = pitch distance
horizontal distance = time distance
```

Now the page becomes a genuine coordinate system.

A note twice as long is actually twice as long on the page.

A note one semitone higher is actually one unit higher.

That's aesthetically and cognitively appealing because graphical
relationships acquire stable musical meanings.

Traditional notation has neither property completely.

## But I see several serious problems

The biggest one is **information density**.

Traditional notation's symbolic duration system looks unnecessarily
complicated until you ask it to represent something like:

``` text
whole note = 𝅝
half       = 𝅗𝅥
quarter    = ♩
eighth     = ♪
```

Those symbols allow time to be compressed enormously.

Imagine a piece with one sustained whole note in the bass while the
right hand plays sixteen 16th notes.

With literal time:

``` text
Bass:  ───────────────────────────────

Treble: ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
```

The entire page width has to accommodate the smallest temporal
subdivision.

Traditional notation effectively says:

> horizontal distance is flexible; read the symbols for exact duration.

That makes engraving much denser.

So literal time improves **geometrical truthfulness** at the expense of
**spatial efficiency**.

Piano rolls encounter exactly this problem: zoom level becomes
important.

### Dense polyphony could become visually overwhelming

Suppose we're representing a ten-note piano chord.

Traditional notation can say approximately:

``` text
♩
```

with ten noteheads stacked on one stem.

Your system potentially needs ten separate horizontal lines occupying
ten pitch rows.

Now imagine Bach counterpoint, late-Romantic piano music, or a full
orchestral score. A literal 12-pitch vertical grid could become
enormous.

And there's an interesting irony here: the five-line staff is partly a
**compression mechanism** too.

Instead of permanently displaying twelve pitch positions per octave, it
displays seven diatonic positions and obtains the others by
modification.

So we're encountering a recurring trade-off:

> **regularity ↔ compression**

The conventional system chooses compression surprisingly often.

## Another problem: absolute chromatic distance isn't always what we perceive

This one is more subtle.

Suppose I'm in D major and encounter:

``` text
D E F# G A B C# D
```

A 12-pitch representation emphasizes the unequal chromatic steps:

``` text
0 → +2 → +2 → +1 → +2 → +2 → +2 → +1
```

But psychologically, a tonal listener may hear something closer to:

``` text
1 2 3 4 5 6 7 1
```

Seven **functional categories**.

Traditional notation makes those categories spatially uniform:

``` text
D E F G A B C D
```

with the key signature silently changing F and C.

So the apparent "distortion" of the chromatic system is simultaneously a
rather clever representation of another structure.

That's why I wouldn't say that 12-TET is necessarily the uniquely
correct base layer. There are at least three legitimate spaces:

``` text
acoustic space
frequency / cents

chromatic space
0 1 2 3 ... 11

tonal space
1 2 3 4 5 6 7
```

Music simultaneously exists in all three.

Your proposal strongly privileges the middle one.

## Your annotation idea could compensate for that

And this may be its most interesting feature.

Rather than forcing the notation to choose between chromatic truth and
tonal meaning, you could allow **layers**:

``` text
             V7             I
          ┌──────┐       ┌──────┐
          tendency ───────→ resolution
               ↓               ↓

11 B                    ─────────────
10 A#
 9 A       ─────────
 8 G#
 7 G       ──────────────────────────
 6 F#
 5 F       ─────────
 4 E                    ─────────────
 ...
 0 C                    ─────────────
                         time →
```

Then annotations could express whatever abstraction is useful:

**harmonic layer:** `V7 → I`

**scale-degree layer:** `7 → 1`

**voice-leading layer:** `→`

**phrasing layer:** brackets/slurs

**performance layer:** `crescendo`, `legato`, "lighter", etc.

And crucially, those could theoretically be **optional**.

A beginner sees:

> pitch + time

An intermediate learner enables:

> pitch + time + scale degree

A harmony student sees:

> pitch + time + scale degree + chord function + voice leading

A performer might instead want:

> pitch + time + dynamics + phrasing

That is something paper notation can't exploit very well, but digital
notation certainly can.

### One thing I would *not* discard too quickly

I wouldn't eliminate note names altogether.

Numbers `0–11` are mathematically elegant but aren't necessarily
cognitively pleasant:

``` text
0  2  4  5  7  9  11
```

versus

``` text
C  D  E  F  G  A  B
```

Humans are very good at categorical labels. "G" may be easier to
remember than "7."

Perhaps the deeper principle isn't that pitches should be numbers. It's:

> **All twelve pitch classes should have equally primitive
> representations.**

They could be twelve names, twelve symbols, twelve positions, numbers,
or some combination. That's a separate design question.

And this leads me to what I think is the strongest aspect of your
proposal. You're questioning an assumption embedded in traditional
notation:

> **Why must performance instructions and musical analysis be encoded by
> the same graphical mechanism?**

They don't necessarily have to be.

Traditional notation evolved on static paper, where space was expensive
and every additional layer competed for room. A modern system could
distinguish a **loss-minimized event representation**---pitch, onset,
duration---from optional **semantic interpretations** such as key,
chord, scale degree, voice leading, phrasing and performance intent.

The price is that we'd likely get something less compact than
conventional notation and possibly worse for rapid sight-reading of
strongly tonal music. But we'd gain **regularity, transparency,
transposition symmetry, and much clearer separation between "what
happens" and "what it means."**

So I think your idea attacks a genuine weakness rather than merely
making notation look more mathematical. The unresolved question I'd
investigate next is **whether the chromatic 12-pitch space really should
be the base visual geometry**. That's a deeper question than what
symbols we put on it, because it determines what musical relationships
become visually obvious and which ones have to be restored through
annotation.

------------------------------------------------------------------------

## User

for the time axis compression, I think can be alleviated by allowing
variable scaling. we can keep the length consistent only in one bar or
only when cross bar notes is meaning. or another approach, we add a
notation on the time axis. it marks the change of the horizontal scale.
both are the same idea as the traditional 5-line staff

for the pitch axis, I'm also thinking if we can fold some of the empty
space so space is used more efficiently but I'm not sure if that's a
good idea. let's discuss more

------------------------------------------------------------------------

## Assistant

I think both ideas move us toward an important principle: **the geometry
doesn't have to be globally uniform to remain locally meaningful**.

Your time-axis proposal is especially convincing to me. The pitch-axis
folding proposal is more dangerous---but also more interesting.

### 1. Variable time scaling seems quite defensible

Suppose each bar gets approximately the same width, regardless of its
internal rhythmic complexity:

``` text
      bar 1                 bar 2                 bar 3
|--------------------|--------------------|--------------------|
   ────── ──────          ── ── ── ──          ────────────
```

Within each bar:

> horizontal distance ∝ duration.

But the proportionality constant can change between bars.

Mathematically, if `x` is graphical distance and `t` is musical time:

`x = kᵢ t`

where `kᵢ` is constant within bar *i*, but can differ between bars.

I think this retains most of the benefit we wanted. If I look at one
bar, a note twice as long really is twice as long. Simultaneous events
line up vertically. Rhythmic relationships are immediately visible.

We sacrifice the ability to compare physical lengths across distant
bars---but that's probably not very important.

And, as you point out, traditional notation already does something
similar, just implicitly.

### Explicit scale changes could go further

Your second solution is particularly interesting when the music has
extreme density differences:

``` text
normal scale
       ↓
|-----------------------|
C  ────────    ────────

        ×4 time magnification
                 ↓
|---------------------------------------|
C  ── ─ ── ─ ─── ─ ─ ─── ── ─ ──
```

You could imagine a small marker:

``` text
|──── ×2 ─────────────────|── ×0.5 ──|
```

meaning something like "from here onward, horizontal distance per beat
doubles."

This is conceptually similar to changing the scale on a graph.

The crucial requirement would be that **scale changes must be visually
unmistakable**. Otherwise a reader might look at two equally long lines
and incorrectly infer equal durations.

I would therefore distinguish two properties:

**Local metric consistency** seems essential.

**Global metric consistency** seems optional.

That's a useful relaxation.

------------------------------------------------------------------------

## Pitch compression is harder

Suppose we literally allocate one row to every semitone:

``` text
B   |
A#  |
A   |
G#  |
G   |────────
F#  |
F   |
E   |────────
D#  |
D   |
C#  |
C   |────────
```

A C-major chord uses only C, E and G. Lots of vertical space is empty.

So naturally we might collapse unused regions:

``` text
G   |────────
    ⋮
E   |────────
    ⋮
C   |────────
```

This is spatially efficient.

But we've just damaged one of the nicest properties of the system.

Originally:

> vertical distance = semitone distance.

After folding:

``` text
C → E
```

and

``` text
E → G
```

might look equally far apart despite being 4 and 3 semitones
respectively.

That's exactly the sort of irregularity we criticized in the five-line
staff.

So I'd be reluctant to collapse pitch space **silently**.

### But explicit folding could work

The graphical language used in technical diagrams gives us an obvious
possibility:

``` text
B
A#
A
G   ─────────
   ╱╱
E   ─────────
D#
   ╱╱
C   ─────────
```

Here `╱╱` explicitly means:

> some pitch rows have been omitted.

Now the reader doesn't infer interval size from the raw physical gap
across the break.

This is analogous to a broken axis in a scientific graph.

And that suggests a broader principle for this notation:

> **Distortion is acceptable when the distortion itself is
> represented.**

That applies beautifully to both of your ideas.

Time:

``` text
────── |×2| ────────────
```

Pitch:

``` text
G
F#
 ╱╱       ← compressed/omitted region
D
C#
C
```

We're no longer demanding that the page be a perfectly uniform
coordinate plane. We're demanding that **the mapping from music to page
is explicit**.

That's a much more achievable goal.

------------------------------------------------------------------------

## However, there's another kind of pitch folding that may be even more useful

Instead of removing *unused chromatic pitches*, we could remove **unused
register**.

Suppose a melody stays between C4 and A4. There is no reason to show:

``` text
C8
...
C7
...
C6
...
C5
...
C4 ← music here
...
C3
...
C2
...
C1
```

We simply show the active range:

``` text
A4
G#4
G4
F#4
F4
E4
D#4
D4
C#4
C4
```

That's lossless compression from the reader's perspective because all
distances *inside the displayed range* remain exact.

And when another register suddenly enters:

``` text
C6 ───────
B5
A#5
 ...
      ╱╱
 ...
E4
D#4
D4 ─────────
C#4
C4 ─────────
```

we introduce a pitch-axis break.

I like this considerably more than dynamically removing unused semitones
*inside* an active register.

------------------------------------------------------------------------

## There's also a fascinating compromise: fold octaves

We could treat pitch as two variables:

`pitch = pitch class + octave`

Then perhaps the primary vertical coordinate only needs twelve rows:

``` text
11 B
10 A#
 9 A
 8 G#
 7 G
 6 F#
 5 F
 4 E
 3 D#
 2 D
 1 C#
 0 C
```

and octave becomes an annotation.

For example:

``` text
        C4────────────
E4────────
        G4────────────

C3────────────────────
```

Perhaps line style, a small numeral, vertical grouping, or some other
device could encode register.

That would compress the vertical dimension dramatically.

But it introduces a severe cost: **melodic contour across octave
boundaries becomes discontinuous**.

A melody

`A4 B4 C5 D5`

should visually rise smoothly.

In a modulo-12 system it becomes:

``` text
A   →
B      →
C  →
D     →
```

with C wrapping from the top back to the bottom.

That's terrible for reading contour unless we invent another mechanism
to repair it.

So I think absolute pitch should probably remain the primary vertical
dimension.

------------------------------------------------------------------------

## I think we're discovering a hierarchy of acceptable compression

Some compression preserves the perceptually important geometry better
than others.

**Very safe:** crop unused pitch ranges above/below the music.

**Fairly safe:** change horizontal time scale at bar boundaries.

**Potentially safe:** explicit axis breaks in pitch or time.

**Riskier:** collapse unused pitches inside an active pitch range.

**Very risky:** fold all octaves onto twelve pitch-class rows.

There's a reason for that ordering.

We want to preserve **local shapes**.

If this:

``` text
     ─── G
   /
 ─── E
/
─── C
```

represents a major triad, then ideally every transposed major triad
should have exactly the same shape.

Likewise, a rhythmic figure should retain its shape locally regardless
of where it occurs.

So perhaps the core invariant shouldn't be:

> "The axes must always have constant scale."

It should instead be:

> **Musically meaningful local relationships should produce invariant
> visual shapes.**

Then compression is allowed whenever it doesn't destroy those local
shapes---or when an explicit break warns the reader that the shape is no
longer metrically meaningful across that boundary.

That is actually a more sophisticated design criterion than simply
making everything proportional.

And there's one question about pitch compression that I think we should
examine before deciding whether folding empty semitones is worthwhile:
**when reading music, how important is the visual *distance* between
simultaneous notes compared with simply recognizing their pitch
labels?**

If interval shape becomes something readers can recognize almost
instantly---e.g. a major triad always visibly has gaps of `4 + 3`---then
preserving vertical distances may be extremely valuable, and we'd want
to be conservative about pitch folding. If readers mostly follow the
textual pitch labels, then aggressive folding becomes much less costly.

------------------------------------------------------------------------

## User

Please summarize the form of the music notation that we discussed above.
one feature per bullet point

------------------------------------------------------------------------

## Assistant

-   **12-TET as the pitch foundation:** Treat all 12 equal-tempered
    pitch classes uniformly rather than privileging the seven diatonic
    notes.

-   **Explicit pitch labels:** Represent pitches directly with text,
    numbers, or another equally primitive set of 12 labels rather than
    using sharps/flats as modifications of seven base notes.

-   **Pitch as the vertical axis:** Higher pitches appear higher and
    lower pitches lower, much like a piano roll.

-   **Semitone-proportional pitch spacing:** One vertical unit
    corresponds to one semitone, making interval sizes visually
    consistent.

-   **Transposition-invariant shapes:** Transposing music preserves the
    visual shapes of melodies, intervals, and chords.

-   **Continuous register:** Octaves normally continue along the
    vertical axis rather than wrapping every octave into the same 12
    rows.

-   **Pitch-range cropping:** Unused registers above and below the
    active music can simply be omitted.

-   **Optional pitch-axis breaks:** Large unused pitch regions may be
    folded/compressed, provided the discontinuity is explicitly marked.

-   **Time as the horizontal axis:** Music proceeds from left to right.

-   **Duration represented by line length:** Notes are horizontal lines
    whose lengths directly represent their durations, similar to a piano
    roll.

-   **Locally proportional time:** Within a region such as a bar, equal
    horizontal distances represent equal durations.

-   **Variable time scaling:** Different bars or sections may use
    different horizontal scales to avoid wasting space.

-   **Explicit time-scale changes:** When necessary, changes in
    horizontal scale can be marked directly on the time axis.

-   **Vertical alignment represents simultaneity:** Notes beginning or
    sounding at the same moment line up at the same horizontal position.

-   **Pitch and rhythm form the base layer:** The fundamental notation
    primarily answers **what pitch occurs, when it occurs, and how long
    it lasts**.

-   **Musical interpretation is a separate layer:** Tonal function does
    not need to be embedded into the basic pitch symbols themselves.

-   **Plain-text annotations:** Chord names, scale degrees, harmonic
    functions, performance instructions, and other meanings can be
    written explicitly around the underlying notes.

-   **Graphical annotations:** Arrows, brackets, connecting lines, and
    similar devices can express voice leading, resolution, phrasing,
    relationships, and larger structures.

-   **Optional analytical information:** A reader should be able to
    perform from pitch and rhythm alone without having to understand the
    harmonic annotations.

-   **Progressive disclosure:** Different levels of annotation can be
    shown depending on whether the reader wants basic performance
    information, harmonic analysis, phrasing, or other structural
    information.

-   **Local geometry takes priority over global geometry:** The page
    need not maintain one constant scale everywhere as long as
    meaningful local relationships remain geometrically consistent.

-   **Distortions must be explicit:** Whenever pitch or time geometry is
    compressed, folded, or rescaled, the notation should visibly
    indicate that change rather than silently changing the meaning of
    distance.

-   **Visual invariance is a major goal:** The same musical
    relationship---such as a four-semitone interval or a particular
    rhythmic pattern---should ideally produce the same local visual
    shape wherever it occurs.

------------------------------------------------------------------------

## User

Please dump the entire chat into a markdown file.

------------------------------------------------------------------------

## Assistant

I can format the conversation into Markdown, but I can't directly export
the hidden system/developer/tool context---only the user-visible chat
between you and me.

------------------------------------------------------------------------

## User

of course. please dump the chat
