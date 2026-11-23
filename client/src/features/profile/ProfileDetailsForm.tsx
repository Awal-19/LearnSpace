import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth, type AuthUser } from '../../app/AuthContext';
import { useExperience } from '../../app/experience';
import { Button, Card, Input, Textarea, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  studentId: z.string().trim().max(50, 'Student ID must be 50 characters or fewer'),
  programme: z.string().trim().max(120, 'Programme must be 120 characters or fewer'),
  level: z.string().trim().max(30, 'Level must be 30 characters or fewer'),
  university: z.string().trim().max(120, 'University must be 120 characters or fewer'),
  bio: z.string().trim().max(500, 'Bio must be 500 characters or fewer'),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function toFormValues(user: AuthUser): ProfileFormValues {
  return {
    name: user.name ?? '',
    studentId: user.studentId ?? '',
    programme: user.programme ?? '',
    level: user.level ?? '',
    university: user.university ?? '',
    bio: user.bio ?? '',
  };
}

export function ProfileDetailsForm() {
  const { user, updateUser } = useAuth();
  const exp = useExperience();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: user ? toFormValues(user) : undefined,
  });

  useEffect(() => {
    if (user) reset(toFormValues(user));
  }, [user, reset]);

  if (!user) return null;

  const bioLength = (watch('bio') ?? '').length;

  const onSubmit = async (values: ProfileFormValues) => {
    setServerError(null);
    try {
      const updated = await request<AuthUser>('/users/me', {
        method: 'PATCH',
        body: {
          name: values.name,
          studentId: values.studentId || null,
          programme: values.programme || null,
          level: values.level || null,
          university: values.university || null,
          bio: values.bio || null,
        },
      });
      updateUser(updated);
      reset(toFormValues(updated));
      toast.show({ kind: 'success', title: 'Profile saved' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save your profile.';
      setServerError(message);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Academic &amp; personal details
      </h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        This helps personalize your study workspace and AI tutor context.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        {serverError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {serverError}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" error={errors.name?.message} {...register('name')} />
          {!exp.isShs ? (
            <Input
              label={exp.labels.studentId}
              placeholder="e.g. 10928374"
              error={errors.studentId?.message}
              {...register('studentId')}
            />
          ) : null}
          <Input
            label="Programme"
            placeholder={exp.isShs ? 'e.g. General Science' : 'e.g. BSc Computer Science'}
            error={errors.programme?.message}
            {...register('programme')}
          />
          <Input
            label={exp.labels.level}
            placeholder={exp.isShs ? 'e.g. SHS 2' : 'e.g. Level 300'}
            error={errors.level?.message}
            {...register('level')}
          />
        </div>

        <Input
          label={exp.labels.institution}
          placeholder={
            exp.isShs ? 'e.g. Dormaa Ahenkro Senior High' : 'e.g. University of Cape Coast'
          }
          error={errors.university?.message}
          {...register('university')}
        />

        <div>
          <Textarea
            label="Bio"
            rows={4}
            placeholder={`Tell us what you are studying or your goals this ${exp.labels.term.toLowerCase()}...`}
            error={errors.bio?.message}
            {...register('bio')}
          />
          <p className="mt-1 text-right text-xs text-neutral-500 dark:text-neutral-400">
            {bioLength}/500
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}
