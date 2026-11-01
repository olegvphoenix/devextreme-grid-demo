using System.Collections;
using System.Globalization;
using System.Linq.Expressions;
using System.Reflection;
using DevExtreme.AspNet.Data;
using MockServer.Data;

namespace MockServer.Api;

/// <summary>
/// Список значений колонки приходит цепочкой <c>[[f,"=",a],"or",[f,"=",b],…]</c> (для ярлыков —
/// <c>["labelsKey","contains","|a|"]</c>): до 5 000 условий из окна «Выбрать показанные».
/// DataSourceLoader компилирует её в цепочку <c>OrElse</c> с <c>ToLower()</c> на каждом условии —
/// тысячи сравнений на строку набора. Такие цепочки на любой глубине групп «and» снимаются с
/// фильтра и накладываются на источник одним <c>HashSet.Contains</c>; то, что остаётся
/// DataSourceLoader, ограничено по числу условий: его цена — проход по набору на каждое.
/// </summary>
public static class ValueListFilter
{
    /// <summary>Условий в фильтре после разбора: три усечённых списка по 5 000 и запас.</summary>
    public const int MaxOperands = 20_000;

    /// <summary>
    /// Условий, остающихся DataSourceLoader после снятия списков. Худший случай — цепочка «and» из
    /// «&lt;&gt;» по коду маркировки на 1 000 000 строк со счётчиком и итогами страницы: 30 условий —
    /// 1,9 с, 50 — 3,3 с (docs/measurements.md). Интерфейс сам даёт не больше 10: по две границы
    /// на пять колонок с диапазоном.
    /// </summary>
    public const int MaxResidualOperands = 30;

    private const string EqualsOp = "=";
    private const string ContainsOp = "contains";
    private const string LabelsKeyField = "labelsKey";
    private const char LabelsSeparator = '|';
    private const string Or = "or";
    private const string And = "and";
    private const string Not = "!";

    public static int CountOperands(IList? filter)
    {
        if (filter is null || filter.Count == 0)
            return 0;
        if (filter[0] is string head)
            return head == Not && filter.Count > 1 ? CountOperands(filter[1] as IList) : 1;
        var count = 0;
        foreach (var item in filter)
            count += CountOperands(item as IList);
        return count;
    }

    /// <summary>Снимает списки значений с <c>options.Filter</c> и накладывает их на источник; остаток фильтра сверх предела — 400.</summary>
    public static IQueryable<ProductionRecord> Apply(IQueryable<ProductionRecord> source, DataSourceLoadOptionsBase options)
    {
        if (options.Filter is { } filter)
        {
            var predicates = new List<Expression<Func<ProductionRecord, bool>>>();
            options.Filter = Lift(filter, predicates);
            foreach (var predicate in predicates)
                source = source.Where(predicate);
        }

        var residual = CountOperands(options.Filter);
        if (residual > MaxResidualOperands)
            throw new BadHttpRequestException(
                $"Фильтр слишком сложный: {residual} условий сверх списков значений, допускается не более {MaxResidualOperands}");
        return source;
    }

    /// <summary>Остаток группы после снятия цепочек; <c>null</c>, когда снято всё; тот же экземпляр, когда снимать нечего.</summary>
    private static IList? Lift(IList filter, List<Expression<Func<ProductionRecord, bool>>> predicates)
    {
        if (TryRewrite(filter, out var predicate))
        {
            predicates.Add(predicate);
            return null;
        }
        if (!IsGroup(filter, And))
            return filter;

        var kept = new List<object>();
        var changed = false;
        foreach (var item in filter)
        {
            if (item is not IList child)
                continue;
            var rest = Lift(child, predicates);
            changed |= !ReferenceEquals(rest, child);
            if (rest is not null)
                kept.Add(rest);
        }
        if (!changed)
            return filter;
        return kept.Count switch
        {
            0 => null,
            1 => (IList)kept[0],
            _ => Join(kept, And),
        };
    }

    private static bool TryRewrite(IList list, out Expression<Func<ProductionRecord, bool>> predicate)
    {
        predicate = null!;
        if (!IsGroup(list, Or))
            return false;

        string? field = null;
        string? op = null;
        var values = new List<object>();
        for (var i = 0; i < list.Count; i += 2)
        {
            if (list[i] is not IList { Count: 3 } leaf
                || leaf[0] is not string leafField
                || leaf[1] is not string leafOp
                || leaf[2] is null)
                return false;
            if (field is null)
                (field, op) = (leafField, leafOp);
            else if (field != leafField || op != leafOp)
                return false;
            values.Add(leaf[2]!);
        }

        if (op == ContainsOp)
            return TryRewriteLabels(field!, values, out predicate);
        if (op != EqualsOp)
            return false;

        var property = typeof(ProductionRecord).GetProperty(field!, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase);
        if (property is null || !property.CanRead || !IsScalar(property.PropertyType))
            return false;

        try
        {
            predicate = (Expression<Func<ProductionRecord, bool>>)typeof(ValueListFilter)
                .GetMethod(nameof(Contains), BindingFlags.NonPublic | BindingFlags.Static)!
                .MakeGenericMethod(property.PropertyType)
                .Invoke(null, new object[] { property, values })!;
            return true;
        }
        catch (TargetInvocationException e) when (e.InnerException is FormatException or InvalidCastException or OverflowException)
        {
            return false;
        }
    }

    /// <summary><c>labelsKey contains "|a|"</c> — у строки есть ярлык <c>a</c>; ярлык не содержит <c>|</c>.</summary>
    private static bool TryRewriteLabels(string field, List<object> values, out Expression<Func<ProductionRecord, bool>> predicate)
    {
        predicate = null!;
        if (!string.Equals(field, LabelsKeyField, StringComparison.OrdinalIgnoreCase))
            return false;

        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in values)
        {
            if (value is not string text
                || text.Length < 3
                || text[0] != LabelsSeparator
                || text[^1] != LabelsSeparator
                || text.IndexOf(LabelsSeparator, 1) != text.Length - 1)
                return false;
            set.Add(text[1..^1]);
        }

        predicate = row => row.Labels.Any(label => set.Contains(label));
        return true;
    }

    private static Expression<Func<ProductionRecord, bool>> Contains<T>(PropertyInfo property, List<object> values) where T : notnull
    {
        var comparer = typeof(T) == typeof(string)
            ? (IEqualityComparer<T>)StringComparer.OrdinalIgnoreCase
            : EqualityComparer<T>.Default;
        var set = new HashSet<T>(comparer);
        foreach (var value in values)
            set.Add((T)Convert.ChangeType(value, typeof(T), CultureInfo.InvariantCulture));

        var row = Expression.Parameter(typeof(ProductionRecord), "row");
        var contains = Expression.Call(Expression.Constant(set), nameof(HashSet<T>.Contains), null, Expression.Property(row, property));
        return Expression.Lambda<Func<ProductionRecord, bool>>(contains, row);
    }

    private static bool IsScalar(Type type) =>
        type == typeof(string) || type == typeof(int) || type == typeof(double) || type == typeof(DateTime);

    /// <summary>Группа вида <c>[cond, op, cond, op, cond]</c> с одним и тем же оператором.</summary>
    private static bool IsGroup(IList list, string op)
    {
        if (list.Count < 3 || list.Count % 2 == 0 || list[0] is not IList)
            return false;
        for (var i = 0; i < list.Count; i++)
        {
            var isOperator = i % 2 == 1;
            if (isOperator ? list[i] is not string s || !string.Equals(s, op, StringComparison.OrdinalIgnoreCase) : list[i] is not IList)
                return false;
        }
        return true;
    }

    private static IList Join(List<object> conditions, string op)
    {
        var group = new List<object>(conditions.Count * 2 - 1);
        foreach (var condition in conditions)
        {
            if (group.Count > 0) group.Add(op);
            group.Add(condition);
        }
        return group;
    }
}
