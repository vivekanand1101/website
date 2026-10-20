---
title: "Changing Primary Key in Django Postgresql Setup"
date: 2019-02-25
categories: 
  - "tech"
originalUrl: "https://vivekanandxyz.wordpress.com/2019/02/25/changing-primary-key-in-django-postgresql-setup/"
---

After visiting my own code after 8 months to make a change, i realised that the schema of the table needed an update and will need a change in primary key field. What i had assumed would be unique turns out wasn't unique after all. So, i needed to put the default "id" field as auto incremental primary key.

Changing the primary key by raw sql in postgresql is simple. The tricky part is how you tell django that you have added a new field and changed the primary key so that it doesn't try to create a new field on running  "django manage.py makemigrations". This is where "state_operations" comes for help.

By specifying state_operations, you tell django that you have done "stuff" in raw sql that is equivalent to running "x operations" via orm migration.

Steps:
- Create an empty migration file: "python manage.py makemigrations  --empty -n "change_primary_key"
	- Put following code in the migration's operations:

```python

migrations.RunSQL(
sql=[
"ALTER TABLE $your table DROP CONSTRAINT $primary key constraint name",
"ALTER TABLE $your table ADD COLUMN id SERIAL PRIMARY KEY;"
"ALTER TABLE $your table ALTER COLUMN $old primary key DROP NOT NULL;"
],
reverse_sql=[
"ALTER TABLE $your table DROP CONSTRAINT $primary key constraint name;",
"ALTER TABLE $your table DROP COLUMN id",
"ALTER TABLE $your table ALTER COLUMN $old primary key SET NOT NULL;",
"ALTER TABLE $your table ADD PRIMARY KEY ($old primary key)",
],
state_operations=[
migrations.RemoveIndex(model_name='$model name as string', name='$primary key constraint name'),
migrations.AlterField(
model_name='$model name as string', name='$old primary key',
field=models.CharField(max_length=100, null=True, blank=True)
),
migrations.AddField(
model_name='$model name as string', name='id',
field=models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
]
)

```

	- The only change that needs to go in the model code for the table is:

```python

$old_primary_key = models.CharField(max_length=100, null=True, blank=True)

```

	- Now, if you run makemigrations, you should not find any new migrations created by django for changing primary key.
The best part about postgresql in this is that if you add a auto increment integer primary key, it auto-fills the rows with the keys starting from 1.

> **Note:** This approach assumes no other table has a foreign key referencing the old primary key. If other tables do reference it, you will need to drop those foreign key constraints first, update the referencing columns to point to the new primary key, and then re-add the foreign key constraints. Skipping this will cause the migration to fail.
